// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createTriggerSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { checkSubscription } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";
import {
  OBSERVATION_TAG_DESCRIPTIONS,
  OBSERVATION_TYPE_FOR_TAG,
  inferTriggerPatternTag,
} from "@/lib/insights";

export const runtime = "nodejs";

const requestSchema = createTriggerSchema.extend({
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
  const rlMin = rateLimit(`triggered:min:${user.id}`, {
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
  const rlDay = rateLimit(`triggered:day:${user.id}`, {
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
    console.error("triggered: idempotency check failed", existingErr.code);
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
        record_type: "trigger_log",
        module_type: "tools",
        source_session_id: idempotencyKey,
        payload_json: {
          fields: {
            trigger: input.trigger,
            interpretation: input.interpretation,
            emotion: input.emotion,
            emotionIntensity: input.emotionIntensity,
            urge: input.urge,
            urgeIntensity: input.urgeIntensity,
            behavior: input.behavior,
            outcome: input.outcome,
            reflection: input.reflection,
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
      console.error("triggered: raw_records insert failed", rawErr?.code);
      return NextResponse.json(
        { error: "Could not save entry" },
        { status: 500 }
      );
    }
    rawRecordId = rawInserted.raw_record_id;
  }

  // 5. Derived row — trigger_entries.
  const { data: existingDerived, error: derivedLookupErr } = await supabase
    .from("trigger_entries")
    .select("trigger_entry_id")
    .eq("user_id", user.id)
    .eq("raw_record_id", rawRecordId)
    .maybeSingle();
  if (derivedLookupErr) {
    console.error("triggered: derived lookup failed", derivedLookupErr.code);
    return NextResponse.json(
      { error: "Could not save entry" },
      { status: 500 }
    );
  }

  if (!existingDerived) {
    const { error: derivedErr } = await supabase
      .from("trigger_entries")
      .insert({
        user_id: user.id,
        raw_record_id: rawRecordId,
        event_text: input.trigger,
        interpretation: input.interpretation,
        emotion: input.emotion,
        emotion_intensity: input.emotionIntensity,
        urge: input.urge,
        urge_intensity: input.urgeIntensity,
        behavior: input.behavior,
        outcome: input.outcome,
        learning: input.reflection,
        after_feeling: input.afterFeeling,
        is_complete: true,
        completed_at: new Date().toISOString(),
      });

    if (derivedErr) {
      console.error("triggered: derived insert failed", derivedErr.code);
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

  // 6. Extract pattern observation (fire-and-forget, heuristic).
  // No AI call — map from structured intensity fields and keywords.
  // Returns null for ambiguous cases (skip observation entirely).
  try {
    const tag = inferTriggerPatternTag({
      emotionIntensity: input.emotionIntensity,
      urgeIntensity: input.urgeIntensity,
      emotion: input.emotion,
      trigger: input.trigger,
    });

    if (tag) {
      const tagDesc = OBSERVATION_TAG_DESCRIPTIONS[tag];
      if (tagDesc) {
        const { data: existingObs } = await supabase
          .from("pattern_observations")
          .select("pattern_observation_id")
          .eq("user_id", user.id)
          .eq("source_raw_record_id", rawRecordId)
          .maybeSingle();

        if (!existingObs) {
          await supabase.from("pattern_observations").insert({
            user_id: user.id,
            source_raw_record_id: rawRecordId,
            source_interaction_entry_id: null,
            person_id: null,
            thread_id: null,
            observation_type: OBSERVATION_TYPE_FOR_TAG[tag],
            observation_tag: tag,
            direction: tagDesc.direction,
            confidence_score: 0.6, // Heuristic, not AI-assigned
            observation_source: "observed",
            extractor_version: "trigger_v1",
            supporting_evidence_json: {
              emotion_intensity: input.emotionIntensity,
              urge_intensity: input.urgeIntensity,
              emotion: input.emotion,
            },
          });
        }
      }
    }
  } catch {
    console.error("triggered: pattern observation insert failed");
  }

  return NextResponse.json({
    success: true,
    rawRecordId,
  });
}
