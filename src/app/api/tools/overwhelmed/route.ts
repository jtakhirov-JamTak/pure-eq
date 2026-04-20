// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createOverwhelmedSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { checkSubscription } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";
import {
  inferOverwhelmedPatternTag,
  OBSERVATION_TAG_COPY,
  OBSERVATION_TYPE_FOR_TAG,
} from "@/lib/insights";
import { regenerateInsights } from "@/lib/insights-writer";

export const runtime = "nodejs";

// Cooldown latch on observation upsert error captures. Same pattern as the
// triggered route — see comment there for rationale.
const OBS_CAPTURE_COOLDOWN_MS = 5 * 60 * 1000;
let lastObsCaptureAt = 0;

const requestSchema = createOverwhelmedSchema.extend({
  idempotencyKey: z.string().uuid(),
});

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Parse + validate.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;
  const idempotencyKey = input.idempotencyKey;

  // 2. Auth.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2b. Subscription gate — Tools have no free tier. Admins bypass.
  if (!isAdmin(user.email)) {
    const access = await checkSubscription(supabase, user.id);
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: "Subscription required" },
        { status: 403 }
      );
    }
  }

  // 3. Rate limit — minute bucket blocks burst, day bucket blocks row exhaustion.
  const rlMin = await rateLimit(`overwhelmed:min:${user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rlMin.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rlMin.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }
  const rlDay = await rateLimit(`overwhelmed:day:${user.id}`, {
    limit: 100,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rlDay.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rlDay.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  // 4. Idempotency check — reuse existing raw row on retry.
  const { data: existingRaw, error: existingErr } = await supabase
    .from("raw_records")
    .select("raw_record_id")
    .eq("user_id", user.id)
    .eq("source_session_id", idempotencyKey)
    .maybeSingle();
  if (existingErr) {
    console.error("overwhelmed: idempotency check failed", existingErr.code);
    return NextResponse.json({ error: "Could not save entry" }, { status: 500 });
  }

  let rawRecordId: string;
  if (existingRaw) {
    rawRecordId = existingRaw.raw_record_id;
  } else {
    const { data: rawInserted, error: rawErr } = await supabase
      .from("raw_records")
      .insert({
        user_id: user.id,
        record_type: "overwhelmed",
        module_type: "tools",
        source_session_id: idempotencyKey,
        payload_json: {
          fields: {
            beforeRating: input.beforeRating,
            bodyLocation: input.bodyLocation ?? null,
            feelingLabel: input.feelingLabel,
            afterRating: input.afterRating,
            afterFeeling: input.afterFeeling,
          },
        },
        schema_version: 1,
        is_complete: true,
        completed_at: new Date().toISOString(),
      })
      .select("raw_record_id")
      .single();

    if (rawErr || !rawInserted) {
      console.error("overwhelmed: raw_records insert failed", rawErr?.code);
      return NextResponse.json(
        { error: "Could not save entry" },
        { status: 500 }
      );
    }
    rawRecordId = rawInserted.raw_record_id;
  }

  // 5. Derived row — overwhelmed_entries.
  const { data: existingDerived, error: derivedLookupErr } = await supabase
    .from("overwhelmed_entries")
    .select("overwhelmed_entry_id")
    .eq("user_id", user.id)
    .eq("raw_record_id", rawRecordId)
    .maybeSingle();
  if (derivedLookupErr) {
    console.error("overwhelmed: derived lookup failed", derivedLookupErr.code);
    return NextResponse.json(
      { error: "Could not save entry" },
      { status: 500 }
    );
  }

  if (!existingDerived) {
    const { error: derivedErr } = await supabase
      .from("overwhelmed_entries")
      .insert({
        user_id: user.id,
        raw_record_id: rawRecordId,
        what_happened: input.feelingLabel,
        body_sensations: input.bodyLocation ?? null,
        overwhelm_before: input.beforeRating,
        overwhelm_after: input.afterRating,
        after_feeling: input.afterFeeling,
        technique_used: "box_breathing",
        is_complete: true,
        completed_at: new Date().toISOString(),
      });

    if (derivedErr) {
      console.error("overwhelmed: derived insert failed", derivedErr.code);
      // Cleanup raw row only if we inserted it this request.
      if (!existingRaw) {
        await supabase
          .from("raw_records")
          .delete()
          .eq("user_id", user.id)
          .eq("raw_record_id", rawRecordId);
      }
      return NextResponse.json(
        { error: "Could not save entry" },
        { status: 500 }
      );
    }
  }

  // 6. Extract pattern observations (fire-and-forget, heuristic, multi-tag).
  // Same DB-enforced idempotency pattern as the trigger route.
  try {
    const tags = inferOverwhelmedPatternTag({
      beforeRating: input.beforeRating,
      afterRating: input.afterRating,
      feelingLabel: input.feelingLabel,
    });

    if (tags.length > 0) {
      const rows = tags
        .map((tag) => {
          const tagDesc = OBSERVATION_TAG_COPY[tag];
          if (!tagDesc) return null;
          return {
            user_id: user.id,
            source_raw_record_id: rawRecordId,
            source_interaction_entry_id: null,
            person_id: null,
            thread_id: null,
            observation_type: OBSERVATION_TYPE_FOR_TAG[tag],
            observation_tag: tag,
            direction: tagDesc.direction,
            confidence_score: 0.5,
            observation_source: "observed",
            extractor_version: "overwhelmed_v2",
            supporting_evidence_json: {
              before_rating: input.beforeRating,
              after_rating: input.afterRating,
            },
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        const { error: obsErr } = await supabase
          .from("pattern_observations")
          .upsert(rows, {
            onConflict: "user_id,source_raw_record_id,observation_tag",
            ignoreDuplicates: true,
          });
        if (obsErr) {
          console.error("overwhelmed: pattern observation upsert failed", obsErr.code);
          const now = Date.now();
          if (now - lastObsCaptureAt >= OBS_CAPTURE_COOLDOWN_MS) {
            lastObsCaptureAt = now;
            Sentry.captureException(new Error("observation_upsert_failed"), {
              tags: { area: "tools", kind: "observation_upsert", route: "overwhelmed" },
            });
          }
        }
      }
    }
  } catch {
    console.error("overwhelmed: pattern observation insert failed");
  }

  // Regenerate cached insights (fire-and-forget).
  regenerateInsights(supabase, user.id).catch(() => {
    console.error("overwhelmed: insight regeneration failed");
  });

  return NextResponse.json({
    success: true,
    rawRecordId,
  });
}
