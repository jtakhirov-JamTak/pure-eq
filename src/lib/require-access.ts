// Pure EQ domain — replace in fork.
//
// Centralized paid-only access-gate helpers. The same `isAdmin →
// checkSubscription → redirect/403` shape was previously inlined at many call
// sites; extracting it prevents drift (e.g. someone forgetting the !isAdmin
// wrapper).
//
// Coins redesign Slice B Phase 3 (2026-05-30): the Tools-window gates
// (requireToolsAccessPage / requireToolsAccessApi / hasToolsAccess) and the
// Coach paywall backstop were retired — Tools, History, Threads, export, and
// manual Coach flows are now free (login-only). AI feedback is coin-gated at the
// API instead.
//
// As of Slice B3 (2026-05-30) the LAST paid caller — Insights — moved to a coin
// debit too, so `requirePaidAccessPage` / `requirePaidAccessApi` (and the
// `checkSubscription` + `user_subscriptions` they read) now have NO live caller.
// They're kept dormant, NOT deleted (founder decision: don't drop subscription
// infra until coins are proven in production). If a future surface needs a
// non-coin paid gate, reuse these rather than re-inlining the isAdmin +
// checkSubscription + redirect/403 block.
//
//   page (throws redirect)      api (returns 403 | null)
//   requirePaidAccessPage       requirePaidAccessApi
//
// Admin detection uses sync `isAdmin(email)` (env var ADMIN_EMAIL) to stay
// consistent with (app)/layout.tsx. If the project ever supports DB-role
// admins via `checkAdmin()`, switch this AND the (app) layout at the same time
// — asymmetry would let a DB-role admin be paywalled.

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { checkSubscription } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";

/** Page-level paid-only gate. Redirects to /coins on deny (the subscription
 * paywall is retired; /paywall itself now forwards to /coins). */
export async function requirePaidAccessPage(user: User): Promise<void> {
  if (isAdmin(user.email)) return;
  const access = await checkSubscription(user.id);
  if (!access.hasAccess) redirect("/coins");
}

/**
 * API-level paid-only gate. Returns a 403 NextResponse on deny, `null` on
 * allow. Idiomatic usage:
 *
 *     const gate = await requirePaidAccessApi(user);
 *     if (gate) return gate;
 */
export async function requirePaidAccessApi(user: User): Promise<NextResponse | null> {
  if (isAdmin(user.email)) return null;
  const access = await checkSubscription(user.id);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Subscription required" }, { status: 403 });
  }
  return null;
}
