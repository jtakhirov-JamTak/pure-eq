// Pure EQ domain — replace in fork.
// Admin endpoint to backfill pattern_observations from existing review_entries,
// trigger_entries, and overwhelmed_entries.
//
// As of Prompt 2:
// - Reviews read pattern_tag directly from ai_reflection_json (AI-assigned,
//   single-tag).
// - Triggered + Overwhelmed run the heuristic extractors locally and write
//   ALL tags the extractor returns (multi-tag).
// - Idempotency is enforced at the DB layer via the unique index on
//   (user_id, source_raw_record_id, observation_tag) from migration 0019.
//   Re-running is safe: duplicate rows no-op via ON CONFLICT DO NOTHING.
//
// Legacy note: Reviews written at PROMPT_VERSION <= "1.0.0"
// (ai_reflection_version = 1) carried a `where_projecting` field that was
// dropped in 1.1.0. The backfill below writes the current
// buildSupportingEvidence shape (`alternative_explanation` only) so the
// evidence shape matches what run-module writes today.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdmin } from "@/lib/admin";
import { checkOrigin } from "@/lib/check-origin";
import { rateLimit } from "@/lib/rate-limit";
import {
  OBSERVATION_TAG_COPY,
  OBSERVATION_TYPE_FOR_TAG,
  inferTriggerPatternTag,
  inferOverwhelmedPatternTag,
} from "@/lib/insights";
import type { ObservationTag } from "@/types";
import type { Database } from "@/types/database";
import { OBSERVATION_TAGS } from "@/types";

type ObservationInsert =
  Database["public"]["Tables"]["pattern_observations"]["Insert"];

export const runtime = "nodejs";

interface BackfillCounts {
  scanned: number;
  attempted: number;
  inserted: number;
  skipped: number;
  truncated: boolean;
}

function emptyCounts(): BackfillCounts {
  return { scanned: 0, attempted: 0, inserted: 0, skipped: 0, truncated: false };
}

// PostgREST `db-max-rows` (default 1000) silently caps `.limit(N>1000)`.
// If the source query returns exactly the limit we passed, we can't tell
// from one query whether the table has more. Surface this to the response
// so an admin re-running can confirm completeness instead of guessing.
const SOURCE_FETCH_LIMIT = 5000;

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rl = await rateLimit(`backfill:${user.id}`, { limit: 2, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const service = createServiceClient();

  // ---------- Reviews ----------
  const reviewCounts = emptyCounts();
  const reviewRows: ObservationInsert[] = [];
  {
    const { data: reviews, error } = await service
      .from("review_entries")
      .select(
        "review_entry_id, user_id, raw_record_id, person_id, thread_id, ai_reflection_json",
      )
      .not("ai_reflection_json", "is", null)
      .limit(SOURCE_FETCH_LIMIT);

    if (error) {
      console.error("backfill: review fetch failed", error.code);
      return NextResponse.json(
        { error: "Failed to fetch reviews" },
        { status: 500 },
      );
    }

    if ((reviews?.length ?? 0) === SOURCE_FETCH_LIMIT) {
      reviewCounts.truncated = true;
      console.warn("backfill: review fetch hit limit — possible truncation");
    }

    for (const r of reviews ?? []) {
      reviewCounts.scanned++;
      if (!r.raw_record_id) continue;

      const reflection = r.ai_reflection_json as Record<string, unknown> | null;
      const tag = reflection?.pattern_tag as string | undefined;
      if (!tag || !(OBSERVATION_TAGS as readonly string[]).includes(tag)) {
        continue;
      }

      const observationTag = tag as ObservationTag;
      const tagDesc = OBSERVATION_TAG_COPY[observationTag];

      reviewRows.push({
        user_id: r.user_id,
        source_raw_record_id: r.raw_record_id,
        source_interaction_entry_id: r.review_entry_id,
        person_id: r.person_id,
        thread_id: r.thread_id,
        observation_type: OBSERVATION_TYPE_FOR_TAG[observationTag],
        observation_tag: observationTag,
        direction: tagDesc.direction,
        confidence_score: 0.8,
        // Match the live route's extractor_version. The unique index doesn't
        // include extractor_version in the conflict key, so first-write wins
        // forever via DO NOTHING. A "backfill_*" prefix would split analytics
        // queries between live-written and backfill-written rows depending on
        // run order — better to keep one canonical version per extractor.
        extractor_version: "review_v2",
        supporting_evidence_json: {
          alternative_explanation:
            (reflection?.alternative_explanation as string) ?? null,
        },
      });
    }
  }

  // ---------- Trigger entries ----------
  const triggerCounts = emptyCounts();
  const triggerRows: ObservationInsert[] = [];
  {
    const { data: triggers, error } = await service
      .from("trigger_entries")
      .select(
        "user_id, raw_record_id, event_text, emotion, emotion_intensity, urge_intensity, learning",
      )
      .eq("is_complete", true)
      .limit(SOURCE_FETCH_LIMIT);

    if (error) {
      console.error("backfill: trigger fetch failed", error.code);
      return NextResponse.json(
        { error: "Failed to fetch trigger entries" },
        { status: 500 },
      );
    }

    if ((triggers?.length ?? 0) === SOURCE_FETCH_LIMIT) {
      triggerCounts.truncated = true;
      console.warn("backfill: trigger fetch hit limit — possible truncation");
    }

    for (const t of triggers ?? []) {
      triggerCounts.scanned++;
      if (!t.raw_record_id) continue;
      if (
        typeof t.emotion_intensity !== "number" ||
        typeof t.urge_intensity !== "number"
      ) {
        continue;
      }

      const tags = inferTriggerPatternTag({
        emotionIntensity: t.emotion_intensity,
        urgeIntensity: t.urge_intensity,
        emotion: t.emotion ?? "",
        trigger: t.event_text ?? "",
        regulationStrategy: t.learning ?? null,
      });

      for (const tag of tags) {
        const tagDesc = OBSERVATION_TAG_COPY[tag];
        if (!tagDesc) continue;
        triggerRows.push({
          user_id: t.user_id,
          source_raw_record_id: t.raw_record_id,
          source_interaction_entry_id: null,
          person_id: null,
          thread_id: null,
          observation_type: OBSERVATION_TYPE_FOR_TAG[tag],
          observation_tag: tag,
          direction: tagDesc.direction,
          confidence_score: 0.6,
          extractor_version: "trigger_v2",
          supporting_evidence_json: {
            emotion_intensity: t.emotion_intensity,
            urge_intensity: t.urge_intensity,
            emotion: t.emotion ?? null,
          },
        });
      }
    }
  }

  // ---------- Overwhelmed entries ----------
  const overwhelmedCounts = emptyCounts();
  const overwhelmedRows: ObservationInsert[] = [];
  {
    const { data: ows, error } = await service
      .from("overwhelmed_entries")
      .select(
        "user_id, raw_record_id, what_happened, overwhelm_before, overwhelm_after",
      )
      .eq("is_complete", true)
      .limit(SOURCE_FETCH_LIMIT);

    if (error) {
      console.error("backfill: overwhelmed fetch failed", error.code);
      return NextResponse.json(
        { error: "Failed to fetch overwhelmed entries" },
        { status: 500 },
      );
    }

    if ((ows?.length ?? 0) === SOURCE_FETCH_LIMIT) {
      overwhelmedCounts.truncated = true;
      console.warn("backfill: overwhelmed fetch hit limit — possible truncation");
    }

    for (const o of ows ?? []) {
      overwhelmedCounts.scanned++;
      if (!o.raw_record_id) continue;
      if (
        typeof o.overwhelm_before !== "number" ||
        typeof o.overwhelm_after !== "number"
      ) {
        continue;
      }

      const tags = inferOverwhelmedPatternTag({
        beforeRating: o.overwhelm_before,
        afterRating: o.overwhelm_after,
        feelingLabel: o.what_happened ?? "",
      });

      for (const tag of tags) {
        const tagDesc = OBSERVATION_TAG_COPY[tag];
        if (!tagDesc) continue;
        overwhelmedRows.push({
          user_id: o.user_id,
          source_raw_record_id: o.raw_record_id,
          source_interaction_entry_id: null,
          person_id: null,
          thread_id: null,
          observation_type: OBSERVATION_TYPE_FOR_TAG[tag],
          observation_tag: tag,
          direction: tagDesc.direction,
          confidence_score: 0.5,
          extractor_version: "overwhelmed_v2",
          supporting_evidence_json: {
            before_rating: o.overwhelm_before,
            after_rating: o.overwhelm_after,
          },
        });
      }
    }
  }

  // ---------- Upserts ----------
  // DB enforces (user_id, source_raw_record_id, observation_tag) uniqueness.
  // With ignoreDuplicates: true, PostgREST returns only the rows that
  // actually inserted. skipped = attempted - inserted.
  async function upsertBatch(
    rows: ObservationInsert[],
    counts: BackfillCounts,
  ): Promise<string | null> {
    counts.attempted = rows.length;
    if (rows.length === 0) {
      counts.inserted = 0;
      counts.skipped = 0;
      return null;
    }
    const { data, error } = await service
      .from("pattern_observations")
      .upsert(rows, {
        onConflict: "user_id,source_raw_record_id,observation_tag",
        ignoreDuplicates: true,
      })
      .select("pattern_observation_id");
    if (error) {
      return error.code ?? error.message ?? "upsert_failed";
    }
    counts.inserted = data?.length ?? 0;
    counts.skipped = counts.attempted - counts.inserted;
    return null;
  }

  const reviewErr = await upsertBatch(reviewRows, reviewCounts);
  if (reviewErr) {
    console.error("backfill: review upsert failed", reviewErr);
    return NextResponse.json({ error: "Review upsert failed" }, { status: 500 });
  }
  const triggerErr = await upsertBatch(triggerRows, triggerCounts);
  if (triggerErr) {
    console.error("backfill: trigger upsert failed", triggerErr);
    return NextResponse.json({ error: "Trigger upsert failed" }, { status: 500 });
  }
  const overwhelmedErr = await upsertBatch(overwhelmedRows, overwhelmedCounts);
  if (overwhelmedErr) {
    console.error("backfill: overwhelmed upsert failed", overwhelmedErr);
    return NextResponse.json(
      { error: "Overwhelmed upsert failed" },
      { status: 500 },
    );
  }

  const totals = {
    scanned:
      reviewCounts.scanned + triggerCounts.scanned + overwhelmedCounts.scanned,
    attempted:
      reviewCounts.attempted +
      triggerCounts.attempted +
      overwhelmedCounts.attempted,
    inserted:
      reviewCounts.inserted +
      triggerCounts.inserted +
      overwhelmedCounts.inserted,
    skipped:
      reviewCounts.skipped + triggerCounts.skipped + overwhelmedCounts.skipped,
  };

  return NextResponse.json({
    success: true,
    totals,
    review: reviewCounts,
    trigger: triggerCounts,
    overwhelmed: overwhelmedCounts,
  });
}
