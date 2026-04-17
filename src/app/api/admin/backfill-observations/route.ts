// Pure EQ domain — replace in fork.
// One-time admin endpoint to backfill pattern_observations from existing
// review_entries that have ai_reflection_json with a pattern_tag.
// Run once after deploying v0.5, then delete or leave dormant.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdmin } from "@/lib/admin";
import { checkOrigin } from "@/lib/check-origin";
import { rateLimit } from "@/lib/rate-limit";
import {
  OBSERVATION_TAG_DESCRIPTIONS,
  OBSERVATION_TYPE_FOR_TAG,
} from "@/lib/insights";
import type { ObservationTag } from "@/types";
import type { Database } from "@/types/database";
import { OBSERVATION_TAGS } from "@/types";

type ObservationInsert =
  Database["public"]["Tables"]["pattern_observations"]["Insert"];

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Origin check
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Auth + admin gate
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Rate limit — 2/min, admin-only, one-time use
  const rl = await rateLimit(`backfill:${user.id}`, { limit: 2, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const service = createServiceClient();

  // Fetch review_entries with AI reflection across all users (capped)
  const { data: reviews, error: fetchErr } = await service
    .from("review_entries")
    .select(
      "review_entry_id, user_id, raw_record_id, person_id, thread_id, ai_reflection_json"
    )
    .not("ai_reflection_json", "is", null)
    .limit(5000);

  if (fetchErr || !reviews) {
    console.error("backfill: fetch reviews failed", fetchErr?.code);
    return NextResponse.json(
      { error: "Failed to fetch reviews" },
      { status: 500 }
    );
  }

  // Fetch existing observations to skip duplicates (capped)
  const { data: existingObs } = await service
    .from("pattern_observations")
    .select("source_raw_record_id")
    .limit(5000);

  const existingRawIds = new Set(
    (existingObs ?? []).map((o) => o.source_raw_record_id)
  );

  // Batch insert: collect rows first, then insert in one call
  const rowsToInsert: ObservationInsert[] = [];

  let skipped = 0;

  for (const review of reviews) {
    if (!review.raw_record_id) {
      skipped++;
      continue;
    }

    if (existingRawIds.has(review.raw_record_id)) {
      skipped++;
      continue;
    }

    const reflection = review.ai_reflection_json as Record<string, unknown>;
    const tag = reflection?.pattern_tag as string | undefined;
    if (
      !tag ||
      !(OBSERVATION_TAGS as readonly string[]).includes(tag)
    ) {
      skipped++;
      continue;
    }

    const observationTag = tag as ObservationTag;
    const tagDesc = OBSERVATION_TAG_DESCRIPTIONS[observationTag];

    rowsToInsert.push({
      user_id: review.user_id,
      source_raw_record_id: review.raw_record_id,
      source_interaction_entry_id: review.review_entry_id,
      person_id: review.person_id,
      thread_id: review.thread_id,
      observation_type: OBSERVATION_TYPE_FOR_TAG[observationTag],
      observation_tag: observationTag,
      direction: tagDesc.direction,
      confidence_score: 0.8, // Fixed for v0.5; future extractors may vary by source quality
      extractor_version: "backfill_v1",
      supporting_evidence_json: {
        how_user_likely_came_across:
          (reflection.how_user_likely_came_across as string) ?? null,
        where_projecting:
          (reflection.where_projecting as string) ?? null,
      },
    });
  }

  let backfilled = 0;
  if (rowsToInsert.length > 0) {
    const { error: insertErr } = await service
      .from("pattern_observations")
      .insert(rowsToInsert);

    if (insertErr) {
      console.error("backfill: batch insert failed", insertErr.code);
      return NextResponse.json(
        { error: "Batch insert failed" },
        { status: 500 }
      );
    }
    backfilled = rowsToInsert.length;
  }

  return NextResponse.json({
    success: true,
    total: reviews.length,
    backfilled,
    skipped,
  });
}
