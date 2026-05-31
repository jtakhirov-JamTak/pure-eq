// Pure EQ domain — replace in fork.
//
// POST /api/insights/generate — produces the user's weekly reflection.
//
// Cost architecture: the 7-day idempotency short-circuit inside
// generateReflection() is the PRIMARY cost gate. Even if a client-side bug
// calls this endpoint 100× inside a 7-day window, only the first call
// burns a Claude credit — subsequent calls return the cached row.
// Rate limits below are defense-in-depth against attempts to force
// generation across users (they shouldn't be able to — paid-only gate —
// but the 3/week bucket ensures even a compromised session can't.)
//
// Error handling — direct migration-0018 lesson:
// - Every failure path captures to Sentry with kind tag.
// - INSERT failures return HTTP 500 (not a silent empty state).
// - No fire-and-forget on the write.

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
  generateReflection,
  ReflectionGenerationError,
} from "@/lib/insights/generate";

export const runtime = "nodejs";
// Opus calls can legitimately take 30–40s on cold starts. Bump runtime cap.
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Auth.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Per-minute flood guard (defense-in-depth). The weekly rate limit was
  // retired in Slice B3 — coins are now the cost gate (each generation reserves
  // COIN_COSTS.weekly_insights before the LLM) and the 7-day idempotency cache
  // caps successful generations to one per week. This per-minute cap only stops
  // a buggy/abusive client from hammering the endpoint (DB-read amplification
  // before the first generation lands). Placed at route entry so a flood is
  // rejected before any DB work or coin charge. 6/min matches the transcribe
  // route (the other expensive AI endpoint); a real user taps once.
  const floodRl = await rateLimit(`insights-generate:min:${user.id}`, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!floodRl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Access is coin-gated (Slice B3), not subscription-gated. The weekly
  // reflection costs COIN_COSTS.weekly_insights (20); the charge happens inside
  // generateReflection ONLY on a genuine cache miss (a re-visit inside the
  // 7-day window returns the cached row before the reserve callback fires, so
  // it's free). Admins bypass the debit, same as the Coach coin path.
  const admin = isAdmin(user.email);
  const insightsCost = COIN_COSTS.weekly_insights;

  // Service-role client — the INSERT bypasses RLS (no INSERT policy).
  const serviceClient = createServiceClient();

  // Per-attempt spend key, computed lazily inside the reserve callback so a
  // cache hit never touches the coin ledger. Base is the user + UTC date — the
  // cache short-circuit guarantees at most one successful generation per 7-day
  // window, and the `:gen:<attempt>` suffix (count of prior refunds) gives a
  // genuine retry-after-failure a fresh key while a concurrent double-fire of
  // the same attempt collapses on the unique (user, ref_key) index to one
  // charge — the exact retry-leak fix from run-module.ts.
  const spendBase = `weekly_insights:${user.id}:${new Date()
    .toISOString()
    .slice(0, 10)}`;
  let spendKey: string | null = null;

  try {
    const result = await generateReflection(serviceClient, user.id, {
      // Coin reserve — runs after the cache miss, before the Opus call. Admins
      // are not charged (and never reach this since we omit the callback for
      // them).
      reserveCoins: admin
        ? undefined
        : async () => {
            const attempt = await nextGenerationAttempt(user.id, spendBase);
            spendKey = generationSpendKey(spendBase, attempt);
            const spend = await spendCoins(
              user.id,
              insightsCost,
              "debit_weekly_insights",
              spendKey,
            );
            if (spend === "insufficient") {
              return {
                result: "insufficient",
                balance: await getBalance(user.id),
                needed: insightsCost,
              };
            }
            if (spend === "invalid") return { result: "error" };
            // 'ok' = THIS call charged → fresh (refund on failure). 'already_-
            // applied' = a concurrent/prior request under this key already paid
            // → not fresh, so a failure here must NOT refund their charge.
            return { result: "charged", fresh: spend === "ok" };
          },
      // Release the hold if a charged generation fails or downgrades to a
      // refusal. Keyed on the same per-attempt spend key, so it's idempotent
      // and lines up with nextGenerationAttempt's refund count.
      onChargedGenerationFailed: async () => {
        if (spendKey) await refundCoins(user.id, insightsCost, spendKey);
      },
    });

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
            "Complete your Communication Profile before generating a reflection.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      status: result.status,
      reflection: result.row,
    });
  } catch (err) {
    // Migration-0018 lesson: INSERT + LLM failures both surface here and
    // must be captured + returned as 500. Silent failure is banned.
    if (err instanceof ReflectionGenerationError) {
      Sentry.captureException(err, {
        tags: { area: "insights_generate", kind: err.kind },
      });
      return NextResponse.json(
        {
          error: "Could not generate your reflection this time. Try again in a moment.",
          kind: err.kind,
        },
        { status: 500 },
      );
    }
    Sentry.captureException(err, {
      tags: { area: "insights_generate", kind: "unknown" },
    });
    return NextResponse.json(
      {
        error: "Could not generate your reflection this time. Try again in a moment.",
      },
      { status: 500 },
    );
  }
}
