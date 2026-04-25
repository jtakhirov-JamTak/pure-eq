// Pure EQ domain — replace in fork.
//
// Centralized access-gate helpers. The same `isAdmin → checkSubscription →
// redirect/403` shape was previously inlined at 8+ call sites. Extracting
// per policy prevents drift (e.g. someone forgetting the !isAdmin wrapper).
//
// One POLICY × two MECHANISMS:
//
//                         page (throws redirect)      api (returns 403 | null)
//   paid-only              requirePaidAccessPage       requirePaidAccessApi
//
// Admin detection uses sync `isAdmin(email)` (env var ADMIN_EMAIL) to stay
// consistent with (app)/layout.tsx. If the project ever supports DB-role
// admins via `checkAdmin()`, switch all helpers AND the (app) layout at
// the same time — asymmetry would let a DB-role admin be paywalled.

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { checkSubscription } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";

/** Page-level paid-only gate. Redirects to /paywall on deny. */
export async function requirePaidAccessPage(user: User): Promise<void> {
  if (isAdmin(user.email)) return;
  const access = await checkSubscription(user.id);
  if (!access.hasAccess) redirect("/paywall");
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
