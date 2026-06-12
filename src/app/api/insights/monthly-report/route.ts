// Pure EQ domain — replace in fork.
//
// POST /api/insights/monthly-report — produces the user's Monthly Report.
//
// Mirrors /api/insights/generate (the weekly reflection route) exactly in
// structure: the 28-day idempotency short-circuit inside
// generateMonthlyReport() is the PRIMARY cost gate; the per-minute rate
// limit only stops a buggy client from hammering the endpoint; coins are
// the access gate (COIN_COSTS.monthly_report, admins bypass). Every failure
// path captures to Sentry with a kind tag and returns a real status code —
// no silent failures on the write path (migration-0018 lesson).

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { isAdmin } from "@/lib/admin";
import { makeGenerationCoinCallbacks } from "@/lib/coins";
import { COIN_COSTS } from "@/types";
import {
  generateMonthlyReport,
  ReportGenerationError,
} from "@/lib/insights/monthly-report";

export const runtime = "nodejs";
// A month of entries + a 2500-token output — Opus can take longer than the
// weekly's call. Same cap as the weekly route (Vercel plan ceiling).
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Per-minute flood guard (defense-in-depth — the 28-day cache is the real
  // cost gate). 6/min matches the other expensive AI endpoints.
  const floodRl = await rateLimit(`monthly-report:min:${user.id}`, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!floodRl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Per-day attempt cap. The cache only blocks repeat calls after a SUCCESS;
  // a failing generation refunds and leaves no row, so each retry is a fresh
  // Opus call — at 6/min that's thousands/day of the most expensive prompt
  // in the app at zero net coin cost. 10/day is invisible to an honest user
  // (one tap, a couple of genuine retries) and caps the burn. The weekly
  // route deliberately has no such cap (B3 removed it); this endpoint's
  // per-call cost is several times larger, hence the extra rail.
  const dayRl = await rateLimit(`monthly-report:day:${user.id}`, {
    limit: 10,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!dayRl.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached. Try again tomorrow." },
      { status: 429 },
    );
  }

  const admin = isAdmin(user.email);
  const reportCost = COIN_COSTS.monthly_report;

  // Service-role client — the INSERT bypasses RLS (no INSERT policy).
  const serviceClient = createServiceClient();

  // Per-attempt spend key semantics (same retry-leak fix as the weekly +
  // Coach) live in makeGenerationCoinCallbacks — shared verbatim with the
  // weekly route. Base is user + UTC date. Admins are not charged: omit the
  // callbacks entirely.
  const spendBase = `monthly_report:${user.id}:${new Date()
    .toISOString()
    .slice(0, 10)}`;
  const coinCallbacks = admin
    ? {}
    : makeGenerationCoinCallbacks(
        user.id,
        reportCost,
        "debit_monthly_report",
        spendBase,
      );

  try {
    const result = await generateMonthlyReport(
      serviceClient,
      user.id,
      coinCallbacks,
    );

    if (result.status === "ai_disabled") {
      return NextResponse.json(
        {
          error:
            "Monthly reports are paused for maintenance right now. Please check back later.",
        },
        { status: 503 },
      );
    }

    if (result.status === "insufficient_entries") {
      return NextResponse.json(
        {
          error: "insufficient_entries",
          count: result.count,
          needed: result.needed,
        },
        { status: 409 },
      );
    }

    if (result.status === "insufficient_coins") {
      return NextResponse.json(
        {
          error: "insufficient_coins",
          needed: result.needed,
          balance: result.balance,
        },
        { status: 402 },
      );
    }

    if (result.status === "profile_missing") {
      return NextResponse.json(
        {
          error:
            "Complete your Communication Profile before generating a report.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      status: result.status,
      report: result.row,
    });
  } catch (err) {
    if (err instanceof ReportGenerationError) {
      Sentry.captureException(err, {
        tags: { area: "monthly_report", kind: err.kind },
      });
      return NextResponse.json(
        {
          error:
            "Could not generate your report this time. Try again in a moment.",
          kind: err.kind,
        },
        { status: 500 },
      );
    }
    Sentry.captureException(err, {
      tags: { area: "monthly_report", kind: "unknown" },
    });
    return NextResponse.json(
      {
        error:
          "Could not generate your report this time. Try again in a moment.",
      },
      { status: 500 },
    );
  }
}
