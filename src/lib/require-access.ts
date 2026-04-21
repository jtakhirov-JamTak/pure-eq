// Pure EQ domain — replace in fork.
//
// Centralized access-gate helpers. The same `isAdmin → checkSubscription →
// redirect/403` shape was previously inlined at 8+ call sites. Extracting
// per policy prevents drift (e.g. someone forgetting the !isAdmin wrapper
// or mixing the paid-only gate with the tools-window gate).
//
// Two POLICIES × two MECHANISMS:
//
//                         page (throws redirect)      api (returns 403 | null)
//   paid-only              requirePaidAccessPage       requirePaidAccessApi
//   tools-window-or-paid   requireToolsAccessPage      requireToolsAccessApi
//
// Plus one boolean variant (`hasToolsAccess`) for the /tools hub which
// renders a locked card instead of redirecting.
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
 * Page-level Tools gate. Admin OR paid OR within 7-day Tools window passes.
 * Used by /tools/overwhelmed and /tools/triggered (leaf pages redirect);
 * /tools hub itself uses `hasToolsAccess` to render a locked card instead.
 */
export async function requireToolsAccessPage(user: User): Promise<void> {
  if (isAdmin(user.email)) return;
  const access = await checkSubscription(user.id);
  if (!access.hasAccess && !access.toolsWindowActive) redirect("/paywall");
}

/**
 * Boolean variant for the /tools hub. Returns true when the caller should
 * render the unlocked UI, false when they should render a locked card.
 */
export async function hasToolsAccess(user: User): Promise<boolean> {
  if (isAdmin(user.email)) return true;
  const access = await checkSubscription(user.id);
  return access.hasAccess || access.toolsWindowActive;
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

/** API-level Tools gate. Same shape as `requirePaidAccessApi`. */
export async function requireToolsAccessApi(user: User): Promise<NextResponse | null> {
  if (isAdmin(user.email)) return null;
  const access = await checkSubscription(user.id);
  if (!access.hasAccess && !access.toolsWindowActive) {
    return NextResponse.json({ error: "Subscription required" }, { status: 403 });
  }
  return null;
}
