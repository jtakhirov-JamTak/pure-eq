// Pure EQ domain — replace in fork.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { SubscriptionStatus } from "@/types";

export interface SubscriptionAccess {
  hasAccess: boolean;
  freePrepareUsed: boolean;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
}

/**
 * Check a user's subscription status. Returns access info used by both
 * the (app) layout gate and individual API routes.
 *
 * Handles trial expiry lazily — if the trial has lapsed, updates the
 * status to 'trial_expired' inline so we don't need a cron job.
 */
export async function checkSubscription(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<SubscriptionAccess> {
  const { data: row, error } = await supabase
    .from("user_subscriptions")
    .select("status, free_prepare_used_at, trial_ends_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("subscription: lookup failed", error.code);
    // Fail closed — a DB hiccup must not grant free access.
    // freePrepareUsed=true ensures both layout gate and Prepare gate block.
    return { hasAccess: false, freePrepareUsed: true, status: "none", trialEndsAt: null };
  }

  if (!row) {
    return { hasAccess: false, freePrepareUsed: false, status: "none", trialEndsAt: null };
  }

  const freePrepareUsed = row.free_prepare_used_at !== null;
  let status = row.status as SubscriptionStatus;

  // Lazy trial expiry: if trial_active but past trial_ends_at, expire it.
  if (status === "trial_active" && row.trial_ends_at) {
    const expired = new Date(row.trial_ends_at) < new Date();
    if (expired) {
      status = "trial_expired";
      const { error: expiryErr } = await supabase
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
    status,
    trialEndsAt: row.trial_ends_at,
  };
}

/**
 * Mark the user's one free Prepare as consumed. Called after the first
 * Prepare's AI output succeeds. Upserts the subscription row so it
 * works even if no row existed before.
 */
export async function markFreePrepareUsed(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const now = new Date().toISOString();

  // Try update first (row may already exist from a prior subscribe).
  const { data: updated, error: updateErr } = await supabase
    .from("user_subscriptions")
    .update({ free_prepare_used_at: now, updated_at: now })
    .eq("user_id", userId)
    .is("free_prepare_used_at", null)
    .select("subscription_id")
    .maybeSingle();

  if (updateErr) {
    console.error("subscription: mark free prepare failed", updateErr.code);
    return false;
  }

  // If no row was updated, insert a new one.
  if (!updated) {
    const { error: insertErr } = await supabase
      .from("user_subscriptions")
      .insert({
        user_id: userId,
        status: "none",
        free_prepare_used_at: now,
      });

    // Unique constraint violation means another request beat us — fine.
    if (insertErr && insertErr.code !== "23505") {
      console.error("subscription: insert for free prepare failed", insertErr.code);
      return false;
    }
  }

  return true;
}

/**
 * Create a trial subscription (v0 mock). In production, this will be
 * replaced by Stripe webhook handling.
 */
export async function createTrialSubscription(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ success: boolean }> {
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();
  const trialEndIso = trialEnd.toISOString();

  // Upsert: update if exists, insert if not.
  const { data: existing } = await supabase
    .from("user_subscriptions")
    .select("subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    // Don't downgrade an active subscription to trial.
    if (existing.status === "active") {
      return { success: true };
    }
    // Block re-activation after trial expired or cancelled.
    // In v0 mock this prevents infinite free trials.
    if (existing.status === "trial_expired" || existing.status === "cancelled") {
      return { success: false };
    }
    const { error } = await supabase
      .from("user_subscriptions")
      .update({
        status: "trial_active",
        trial_started_at: nowIso,
        trial_ends_at: trialEndIso,
        updated_at: nowIso,
      })
      .eq("user_id", userId);

    if (error) {
      console.error("subscription: trial update failed", error.code);
      return { success: false };
    }
  } else {
    const { error } = await supabase
      .from("user_subscriptions")
      .insert({
        user_id: userId,
        status: "trial_active",
        trial_started_at: nowIso,
        trial_ends_at: trialEndIso,
      });

    // 23505 = unique constraint violation — another request beat us. That's fine.
    if (error && error.code !== "23505") {
      console.error("subscription: trial insert failed", error.code);
      return { success: false };
    }
  }

  return { success: true };
}
