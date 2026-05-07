// Pure EQ — Coach SOT 2026-05-06.
//
// GET /api/coach/prepare/most-recent?personId={uuid}
// Returns the user's most recent non-deleted Prepare for the given person
// within CALIBRATION_LOOKBACK_DAYS (14d, see page-flow.ts). Used by the
// Review page on Full Review to decide Page 5 shape: calibration block
// when a Prepare exists in window, standalone branch when not.
//
// Returns `{ snapshot: PrepareSnapshot | null }`. Null means "no link";
// Review page falls through to the standalone branch.
//
// Server is the AUTHORITATIVE link source — Review's prePromptEnrich
// hook re-queries on POST. This GET is a UX optimization so the page
// can render the right shape before submit; it MUST NOT be the only
// gate (a slow client-side GET that returns null after the user already
// reached page 5 must not poison the server's view).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { findLinkedPrepareEntry } from "@/lib/coach/calibration";
import { verifyPersonOwnership } from "@/lib/verify-ownership";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  // Origin check applies to user-scoped enumeration GETs per CLAUDE.md.
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Two-bucket rate limit: 60/min for tab-switching workloads, 1000/day
  // to cap the data-bleed cost of a session compromise (per CLAUDE.md
  // "Per-day rate limit on enumeration reads").
  const rlMin = await rateLimit(`prepare:most-recent:min:${user.id}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rlMin.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const rlDay = await rateLimit(`prepare:most-recent:day:${user.id}`, {
    limit: 1000,
    windowMs: 86_400_000,
  });
  if (!rlDay.allowed) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  }

  const url = new URL(req.url);
  const personId = url.searchParams.get("personId")?.trim();
  if (!personId || !UUID_RE.test(personId)) {
    return NextResponse.json({ error: "Invalid personId" }, { status: 400 });
  }

  // Ownership check — same as POST flows. RLS would also block, but
  // returning 400 here is more informative than a silent null.
  const owns = await verifyPersonOwnership(supabase, user.id, personId);
  if (!owns) {
    return NextResponse.json({ error: "Invalid person" }, { status: 400 });
  }

  const snapshot = await findLinkedPrepareEntry(supabase, user.id, personId);
  return NextResponse.json({ snapshot });
}
