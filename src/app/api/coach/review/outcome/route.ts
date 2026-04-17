// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { immediateOutcomeSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import {
  OBSERVATION_TAG_DESCRIPTIONS,
  OBSERVATION_TYPE_FOR_TAG,
} from "@/lib/insights";
import type { ObservationTag } from "@/types";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = immediateOutcomeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = await rateLimit(`review-outcome:min:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Verify the review entry belongs to this user
  // Per-day rate limit
  const rlDay = await rateLimit(`review-outcome:day:${user.id}`, {
    limit: 100,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rlDay.allowed) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  }

  const { data: entry, error: lookupErr } = await supabase
    .from("review_entries")
    .select("review_entry_id, raw_record_id, outcome_json")
    .eq("review_entry_id", input.reviewEntryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupErr || !entry || !entry.raw_record_id) {
    return NextResponse.json({ error: "Review entry not found" }, { status: 404 });
  }

  // Prevent overwriting an existing outcome
  if (entry.outcome_json) {
    return NextResponse.json({ error: "Outcome already submitted" }, { status: 409 });
  }

  // Store outcome
  const outcomeData = {
    movedForward: input.movedForward,
    theySeemUnderstood: input.theySeemUnderstood,
    usedPreparePlan: input.usedPreparePlan,
    submittedAt: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .from("review_entries")
    .update({ outcome_json: outcomeData })
    .eq("review_entry_id", input.reviewEntryId)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("review outcome: update failed", updateErr.code);
    return NextResponse.json({ error: "Could not save outcome" }, { status: 500 });
  }

  // Also store in raw_records for source-of-truth (idempotent via source_session_id)
  const sessionId = `outcome-${input.reviewEntryId}`;
  const { data: existingRaw } = await supabase
    .from("raw_records")
    .select("raw_record_id")
    .eq("user_id", user.id)
    .eq("source_session_id", sessionId)
    .maybeSingle();

  if (!existingRaw) {
    const { error: rawErr } = await supabase
      .from("raw_records")
      .insert({
        user_id: user.id,
        record_type: "outcome_tracking",
        module_type: "outcome_tracking",
        source_session_id: sessionId,
        payload_json: {
          source_entry_type: "review",
          source_entry_id: input.reviewEntryId,
          ...outcomeData,
        },
        schema_version: 1,
        is_complete: true,
        completed_at: new Date().toISOString(),
      });
    if (rawErr) {
      console.error("review outcome: raw_records insert failed", rawErr.code);
    }
  }

  // Extract pattern observation: prepare_plan_not_used
  if (input.usedPreparePlan === "no") {
    try {
      const tag: ObservationTag = "prepare_plan_not_used";
      const tagDesc = OBSERVATION_TAG_DESCRIPTIONS[tag];

      // Use the review's raw_record_id for observation linking
      const { data: existingObs } = await supabase
        .from("pattern_observations")
        .select("pattern_observation_id")
        .eq("user_id", user.id)
        .eq("source_raw_record_id", entry.raw_record_id)
        .eq("observation_tag", tag)
        .maybeSingle();

      if (!existingObs) {
        await supabase.from("pattern_observations").insert({
          user_id: user.id,
          source_raw_record_id: entry.raw_record_id,
          source_interaction_entry_id: input.reviewEntryId,
          observation_type: OBSERVATION_TYPE_FOR_TAG[tag],
          observation_tag: tag,
          direction: tagDesc.direction,
          confidence_score: 0.7,
          observation_source: "observed",
          extractor_version: "outcome_v1",
          supporting_evidence_json: {
            used_prepare_plan: input.usedPreparePlan,
            moved_forward: input.movedForward,
          },
        });
      }
    } catch {
      console.error("review outcome: observation insert failed");
    }
  }

  return NextResponse.json({ success: true });
}
