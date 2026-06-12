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
import {
  spendCoins,
  refundCoins,
  getBalance,
  generationSpendKey,
  nextGenerationAttempt,
} from "@/lib/coins";
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

  const admin = isAdmin(user.email);
  const reportCost = COIN_COSTS.monthly_report;

  // Service-role client — the INSERT bypasses RLS (no INSERT policy).
  const serviceClient = createServiceClient();

  // Per-attempt spend key (same retry-leak fix as the weekly + Coach): base
  // is user + UTC date; the :gen:<attempt> suffix gives a genuine retry a
  // fresh key while a concurrent double-tap collapses to one charge.
  const spendBase = `monthly_report:${user.id}:${new Date()
    .toISOString()
    .slice(0, 10)}`;
  let spendKey: string | null = null;

  try {
    const result = await generateMonthlyReport(serviceClient, user.id, {
      reserveCoins: admin
        ? undefined
        : async () => {
            const attempt = await nextGenerationAttempt(user.id, spendBase);
            spendKey = generationSpendKey(spendBase, attempt);
            const spend = await spendCoins(
              user.id,
              reportCost,
              "debit_monthly_report",
              spendKey,
            );
            if (spend === "insufficient") {
              return {
                result: "insufficient",
                balance: await getBalance(user.id),
                needed: reportCost,
              };
            }
            if (spend === "invalid") return { result: "error" };
            return { result: "charged", fresh: spend === "ok" };
          },
      onChargedGenerationFailed: async () => {
        if (spendKey) await refundCoins(user.id, reportCost, spendKey);
      },
    });

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
