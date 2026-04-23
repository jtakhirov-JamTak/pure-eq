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
import { requirePaidAccessApi } from "@/lib/require-access";
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

  // Paid-only gate.
  const paidGate = await requirePaidAccessApi(user);
  if (paidGate) return paidGate;

  // Defense-in-depth rate limit. Real cost gate is the 7-day idempotency
  // inside generateReflection(); this just caps pathological request rates.
  const rlWeek = await rateLimit(`insights-generate:week:${user.id}`, {
    limit: 3,
    windowMs: 7 * 24 * 60 * 60 * 1000,
  });
  if (!rlWeek.allowed) {
    return NextResponse.json(
      { error: "Too many generation attempts this week" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rlWeek.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  // Service-role client — the INSERT bypasses RLS (no INSERT policy).
  const serviceClient = createServiceClient();

  try {
    const result = await generateReflection(serviceClient, user.id);

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
