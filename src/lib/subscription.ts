// Pure EQ domain — replace in fork.
import { cache } from "react";
import type { Database } from "@/types/database";
import type { SubscriptionStatus } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Both free windows are anchored to onboarding completion
 * (user_profiles.created_at), not signup, so a workshop attendee who
 * signs up days in advance doesn't burn their window before engaging.
 *
 * Coach: 1 free Prepare + 1 free Review inside COACH_FREE_PERIOD_DAYS.
 * Tools: unlimited Overwhelmed + Triggered inside TOOLS_FREE_PERIOD_DAYS
 *        (monetization test — see docs/access_route_matrix.md).
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const COACH_FREE_PERIOD_DAYS = 3;
const TOOLS_FREE_PERIOD_DAYS = 7;

export type FreeUsageField =
  | "freePrepareUsed"
  | "freeReviewUsed"
  | "freeBeforeYouSendUsed"
  | "freePulseCheckUsed";

const FREE_USAGE_COLUMN: Record<
  FreeUsageField,
  | "free_prepare_used_at"
  | "free_review_used_at"
  | "free_before_you_send_used_at"
  | "free_pulse_check_used_at"
> = {
  freePrepareUsed: "free_prepare_used_at",
  freeReviewUsed: "free_review_used_at",
  freeBeforeYouSendUsed: "free_before_you_send_used_at",
  freePulseCheckUsed: "free_pulse_check_used_at",
};

export interface SubscriptionAccess {
  hasAccess: boolean;
  freePrepareUsed: boolean;
  freeReviewUsed: boolean;
  freeBeforeYouSendUsed: boolean;
  freePulseCheckUsed: boolean;
  freePeriodActive: boolean;
  toolsWindowActive: boolean;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
}

/**
 * Check a user's subscription status. Returns access info used by both
 * the (app) layout gate and individual API routes.
 *
 * The free period is anchored to onboarding completion (user_profiles),
 * so the caller does not need to pass a date in.
 *
 * Wrapped in `React.cache()` so a single server render that reads access
 * from multiple call sites (layout + page + helper) hits the DB once per
 * request. The cached key is `userId` only; supabase client is created
 * inside (and is itself request-scoped via next/headers cookies), so
 * React.cache's Object.is arg comparison sees stable input.
 *
 * Handles trial expiry lazily — if a legacy trial has lapsed, updates
 * the status to 'trial_expired' inline so we don't need a cron job.
 * Lazy expiry is only reachable when `status === 'trial_active'`; admin
 * callers bypass checkSubscription entirely before reaching here, so an
 * admin row in `trial_active` (unusual) would not be silently downgraded
 * from any current call site.
 */
export const checkSubscription = cache(async (userId: string): Promise<SubscriptionAccess> => {
  const supabase = await createClient();
  // Fire both reads in parallel — they're independent. Used to run
  // sequentially, which added ~50–100ms per page render on top of the
  // layout + page auth round trips. Users without a profile are caught
  // by the routing hub upstream; fail closed if missing.
  const [profileRes, subRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("user_subscriptions")
      .select("status, free_prepare_used_at, free_review_used_at, free_before_you_send_used_at, free_pulse_check_used_at, trial_ends_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const profileRow = profileRes.data;
  const { data: row, error } = subRes;

  const now = Date.now();
  const profileCreatedMs = profileRow?.created_at
    ? new Date(profileRow.created_at).getTime()
    : null;
  const freePeriodActive =
    profileCreatedMs !== null &&
    now - profileCreatedMs < COACH_FREE_PERIOD_DAYS * DAY_MS;
  const toolsWindowActive =
    profileCreatedMs !== null &&
    now - profileCreatedMs < TOOLS_FREE_PERIOD_DAYS * DAY_MS;

  if (error) {
    console.error("subscription: lookup failed", error.code);
    // Fail closed — a DB hiccup must not grant free access.
    return { hasAccess: false, freePrepareUsed: true, freeReviewUsed: true, freeBeforeYouSendUsed: true, freePulseCheckUsed: true, freePeriodActive: false, toolsWindowActive: false, status: "none", trialEndsAt: null };
  }

  if (!row) {
    return { hasAccess: false, freePrepareUsed: false, freeReviewUsed: false, freeBeforeYouSendUsed: false, freePulseCheckUsed: false, freePeriodActive, toolsWindowActive, status: "none", trialEndsAt: null };
  }

  const freePrepareUsed = row.free_prepare_used_at !== null;
  const freeReviewUsed = row.free_review_used_at !== null;
  const freeBeforeYouSendUsed = row.free_before_you_send_used_at !== null;
  const freePulseCheckUsed = row.free_pulse_check_used_at !== null;
  let status = row.status as SubscriptionStatus;

  // Lazy trial expiry: legacy trial_active rows are expired past trial_ends_at.
  // No new rows are created any more (subscriptions retired for the coins model);
  // this only ever touches dormant legacy rows.
  // Uses service role since RLS pins `status` against user-initiated writes.
  if (status === "trial_active" && row.trial_ends_at) {
    const expired = new Date(row.trial_ends_at) < new Date();
    if (expired) {
      status = "trial_expired";
      const service = createServiceClient();
      const { error: expiryErr } = await service
        .from("user_subscriptions")
        .update({ status: "trial_expired", updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (expiryErr) {
        console.error("subscription: trial expiry update failed", expiryErr.code);
      }
    }
  }

  const hasAccess = status === "trial_active" || status === "active";

  return {
    hasAccess,
    freePrepareUsed,
    freeReviewUsed,
    freeBeforeYouSendUsed,
    freePulseCheckUsed,
    freePeriodActive,
    toolsWindowActive,
    status,
    trialEndsAt: row.trial_ends_at,
  };
});

/**
 * Atomically reserve a user's one free use (Prepare or Review) BEFORE the
 * Anthropic call. This closes the race where parallel requests all see
 * "free use not consumed" and all proceed to consume paid API budget.
 *
 * Returns "reserved" if this call succeeded in claiming the free use,
 * "already_used" if another path already consumed it (possibly a concurrent
 * request that won the race).
 *
 * Does NOT revert on AI failure. Trade-off: a failed first attempt burns
 * the free use, but the caller's idempotency key lets them retry the same
 * submission against the same reservation.
 */
export async function reserveFreeUse(
  userId: string,
  field: FreeUsageField,
): Promise<"reserved" | "already_used"> {
  const column = FREE_USAGE_COLUMN[field];
  const now = new Date().toISOString();

  // Service role: RLS pins these columns against user-initiated writes
  // (so a compromised client can't PATCH free_*_used_at to null and
  // reset their free uses). Reservation is a server-only operation.
  const service = createServiceClient();

  type SubRow = Database["public"]["Tables"]["user_subscriptions"];
  let updatePayload: SubRow["Update"];
  let insertPayload: SubRow["Insert"];
  if (column === "free_prepare_used_at") {
    updatePayload = { free_prepare_used_at: now, updated_at: now };
    insertPayload = { user_id: userId, status: "none", free_prepare_used_at: now };
  } else if (column === "free_review_used_at") {
    updatePayload = { free_review_used_at: now, updated_at: now };
    insertPayload = { user_id: userId, status: "none", free_review_used_at: now };
  } else if (column === "free_before_you_send_used_at") {
    updatePayload = { free_before_you_send_used_at: now, updated_at: now };
    insertPayload = { user_id: userId, status: "none", free_before_you_send_used_at: now };
  } else {
    updatePayload = { free_pulse_check_used_at: now, updated_at: now };
    insertPayload = { user_id: userId, status: "none", free_pulse_check_used_at: now };
  }

  // Attempt 1: UPDATE if column is null. Atomic — only one concurrent
  // request can match `.is(column, null)` and receive a row back.
  const { data: u1, error: u1Err } = await service
    .from("user_subscriptions")
    .update(updatePayload)
    .eq("user_id", userId)
    .is(column, null)
    .select("subscription_id")
    .maybeSingle();

  if (u1Err) {
    console.error(`subscription: reserve ${column} update failed`, u1Err.code);
    return "already_used"; // fail closed
  }
  if (u1) return "reserved";

  // Attempt 2: row may not exist yet — try INSERT with the column set.
  const { error: insErr } = await service
    .from("user_subscriptions")
    .insert(insertPayload);
  if (!insErr) return "reserved";
  if (insErr.code !== "23505") {
    console.error(`subscription: reserve ${column} insert failed`, insErr.code);
    return "already_used"; // fail closed
  }

  // Attempt 3: insert lost the race — row exists now. Retry the atomic UPDATE.
  const { data: u2, error: u2Err } = await service
    .from("user_subscriptions")
    .update(updatePayload)
    .eq("user_id", userId)
    .is(column, null)
    .select("subscription_id")
    .maybeSingle();
  if (u2Err) {
    console.error(`subscription: reserve ${column} retry failed`, u2Err.code);
    return "already_used";
  }
  return u2 ? "reserved" : "already_used";
}

// createSubscription (the v0 subscribe mock) was removed in Slice B2 — the coins
// model replaced subscriptions. Purchased coins are granted only by the Stripe
// webhook (src/app/api/payments/webhook). user_subscriptions stays DORMANT (read
// by checkSubscription for the legacy Insights gate until B3); nothing writes
// status='active' any more.
