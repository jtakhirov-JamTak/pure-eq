import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { getBalance } from "@/lib/coins";

export const runtime = "nodejs";

// Slice B coins — own-wallet balance read. Used by the Save-first Coach pages
// to show the user how many coins they have before they tap "Get AI feedback".
//
// NOTE: no paid-access gate here on purpose. The whole point of the coins model
// is that balance IS the access signal — gating this read behind a subscription
// would be circular. It returns ONLY the caller's own balance (keyed off the
// authenticated user id), so there's nothing to leak cross-user.
export async function GET(req: Request) {
  // Same origin-check discipline as every user-scoped read — a balance leak is
  // low-stakes, but fetch-based CSRF from a compromised page is cheap to block.
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Light rate limit — this is polled on the saved screen, so allow a generous
  // per-minute burst but cap per-day scraping like the other enumeration reads.
  const rlMin = await rateLimit(`coins-balance:min:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rlMin.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const rlDay = await rateLimit(`coins-balance:day:${user.id}`, {
    limit: 1000,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rlDay.allowed) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  }

  // getBalance fails CLOSED to 0 on a DB error (logged + Sentry-captured inside
  // coins.ts), which renders as "needs coins" rather than a free generation.
  const balance = await getBalance(user.id);
  return NextResponse.json({ balance });
}
