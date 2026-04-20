// Regenerate cached insights and write to derived_insights table.
// Called fire-and-forget after observation extraction in coach + tools routes.
// Insights page reads these cached results first, falls back to live
// computation if stale or missing.

import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import type { Database, Json } from "@/types/database";
import {
  checkInsightThresholds,
  computePatternSnapshot,
  computeReflectionRegulationGap,
  COMPARATOR_COPY,
  enrichObservations,
  getPersonPatterns,
  HIGH_FIT_RECORD_TYPES,
} from "@/lib/insights";

export const GENERATOR_VERSION = "v1";

// Cooldown latch: regenerate runs fire-and-forget from 4 call sites on every
// coach/tool submission. If a structural issue starts throwing (schema drift,
// DB outage), without this guard Sentry would ingest one event per request
// and burn the quota before anyone noticed the underlying failure. Same
// pattern as rate-limit.ts's Upstash fallback catch.
const CAPTURE_COOLDOWN_MS = 5 * 60 * 1000;
let lastCaptureAt = 0;

function captureWithCooldown(
  err: unknown,
  tags: Record<string, string>,
): void {
  const now = Date.now();
  if (now - lastCaptureAt < CAPTURE_COOLDOWN_MS) return;
  lastCaptureAt = now;
  Sentry.captureException(err, { tags });
}

export async function regenerateInsights(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  try {
    await regenerateInsightsInner(supabase, userId);
  } catch (err) {
    captureWithCooldown(err, { area: "insights", kind: "regenerate" });
    throw err;
  }
}

async function regenerateInsightsInner(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  // 1. Fetch all data needed (same queries as insights page).
  const [rawRecordsRes, observationsRes, personsRes] = await Promise.all([
    supabase
      .from("raw_records")
      .select("raw_record_id, record_type, created_at, person_id")
      .eq("user_id", userId)
      .eq("is_complete", true)
      .is("deleted_at", null)
      .limit(1000),
    supabase
      .from("pattern_observations")
      .select(
        "observation_tag, observed_at, observation_source, person_id, source_raw_record_id",
      )
      .eq("user_id", userId)
      .order("observed_at", { ascending: false })
      .limit(500),
    supabase
      .from("persons")
      .select("person_id, display_name")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(100),
  ]);

  const rawRecords = rawRecordsRes.data ?? [];
  const rawObservations = observationsRes.data ?? [];
  const persons = personsRes.data ?? [];

  if (rawRecords.length === 0) return;

  // 2. Enrich observations (shared helper with the page).
  const { observations, personObservations } = enrichObservations(
    rawObservations,
    rawRecords,
  );

  // 3. Compute entry stats.
  const distinctDays = new Set(
    rawRecords
      .filter((r) => r.created_at)
      .map((r) => r.created_at!.slice(0, 10)),
  ).size;
  const eventTypes = [...new Set(rawRecords.map((r) => r.record_type))];
  const highFitEntries = rawRecords.filter((r) =>
    (HIGH_FIT_RECORD_TYPES as readonly string[]).includes(r.record_type),
  ).length;

  const thresholdResult = checkInsightThresholds({
    totalEntries: rawRecords.length,
    distinctDays,
    eventTypes,
    highFitEntries,
  });

  const now = new Date();
  const nowMs = now.getTime();
  const periodStart =
    rawRecords
      .filter((r) => r.created_at)
      .map((r) => r.created_at!)
      .sort()[0] ?? now.toISOString();
  // Migration 0003 CHECK: period_end > period_start (strict >). A first-submit
  // user's oldest created_at can equal now, or clock drift can land them
  // equal. Guarantee at least 1ms separation so the INSERT never silently
  // fails the CHECK.
  const periodStartMs = new Date(periodStart).getTime();
  const periodEndMs = Math.max(periodStartMs + 1, nowMs);
  const periodEndIso = new Date(periodEndMs).toISOString();

  const baseRow = {
    user_id: userId,
    generator_version: GENERATOR_VERSION,
    generated_at: now.toISOString(),
    period_start: periodStart,
    period_end: periodEndIso,
    time_window_type: "all_time",
    event_types_used: eventTypes,
  };

  // 4. Compute insights.
  const rows: Database["public"]["Tables"]["derived_insights"]["Insert"][] = [];

  // 4a. Top pattern (replaces former blind_spot + tend_to_land).
  const snapshot =
    thresholdResult.state === "threshold_met"
      ? computePatternSnapshot(observations, now)
      : null;

  if (snapshot) {
    const counterTags = snapshot.evolution.counterObservations.map((c) => c.tag);
    rows.push({
      ...baseRow,
      insight_type: "top_pattern",
      person_id: null,
      summary_text: snapshot.copy.pattern,
      confidence_level: "emerging",
      evidence_count: snapshot.distinctEntries,
      distinct_days: snapshot.distinctDays,
      supporting_pattern_ids: [snapshot.tag, ...counterTags],
      metadata_json: snapshot as unknown as Json,
    });
  }

  // 4a-bis. Reflection > Regulation comparator.
  // Compute runs for every user with any raw_records; persists only when
  // qualifies. The user_feature_flags.show_comparator flag gates the RENDER,
  // not the COMPUTE — the writer stays flag-agnostic so flipping the flag
  // reveals pre-existing rows rather than triggering a regeneration.
  const comparator = computeReflectionRegulationGap(
    observations,
    rawRecords.map((r) => ({ record_type: r.record_type, created_at: r.created_at })),
    now,
  );

  if (comparator.qualifies) {
    // "established" tier: has material margin over threshold on all axes.
    // Same two-tier shape as PatternCard (emerging | established).
    const established =
      comparator.reviewCount >= 5 &&
      comparator.reactiveCount >= 5 &&
      comparator.gap >= 0.45;
    rows.push({
      ...baseRow,
      insight_type: "reflection_regulation_gap",
      person_id: null,
      summary_text: COMPARATOR_COPY.pattern,
      confidence_level: established ? "established" : "emerging",
      evidence_count: comparator.reviewCount + comparator.reactiveCount,
      distinct_days: comparator.distinctDays,
      supporting_pattern_ids: comparator.contributingTags,
      metadata_json: comparator as unknown as Json,
    });
  }

  // 4b. Per-person patterns.
  const personNameMap = new Map(
    persons.map((p) => [p.person_id, p.display_name]),
  );

  const personStatsAccum = new Map<
    string,
    {
      totalEntries: number;
      reviewEntries: number;
      repairEntries: number;
      displayName: string;
      days: Set<string>;
    }
  >();

  for (const r of rawRecords) {
    if (!r.person_id) continue;
    const name = personNameMap.get(r.person_id);
    if (!name) continue;

    let entry = personStatsAccum.get(r.person_id);
    if (!entry) {
      entry = {
        totalEntries: 0,
        reviewEntries: 0,
        repairEntries: 0,
        displayName: name,
        days: new Set(),
      };
      personStatsAccum.set(r.person_id, entry);
    }
    entry.totalEntries++;
    if (r.created_at) entry.days.add(r.created_at.slice(0, 10));
    if (r.record_type === "review") entry.reviewEntries++;
    if (r.record_type === "repair") entry.repairEntries++;
  }

  const finalPersonStats = new Map(
    [...personStatsAccum].map(([id, s]) => [
      id,
      {
        totalEntries: s.totalEntries,
        distinctDays: s.days.size,
        reviewEntries: s.reviewEntries,
        repairEntries: s.repairEntries,
        displayName: s.displayName,
      },
    ]),
  );

  const personPatterns = getPersonPatterns(personObservations, finalPersonStats);
  for (const pp of personPatterns) {
    // Positional encoding: always 2 slots — index 0 = negative, index 1 =
    // positive, empty string when absent. Without the placeholder, a
    // positive-only person's posTag lands at tags[0] and the page reads it
    // as a negative tag, direction check fails, card renders empty.
    const patternIds: string[] = [
      pp.topNegative?.tag ?? "",
      pp.topPositive?.tag ?? "",
    ];
    const summaryText =
      pp.topNegative?.summary ?? pp.topPositive?.summary ?? "";
    if (!summaryText) continue; // defensive: don't persist blank rows

    rows.push({
      ...baseRow,
      insight_type: "person_pattern",
      person_id: pp.personId,
      summary_text: summaryText,
      confidence_level: pp.confidenceLevel,
      evidence_count: pp.entryCount,
      distinct_days: finalPersonStats.get(pp.personId)?.distinctDays ?? 0,
      supporting_pattern_ids: patternIds,
    });
  }

  // 5. Refresh cache. Wipe covers legacy rows plus stale person_pattern rows
  // whose person dropped below threshold. If rows.length === 0 we still wipe
  // so stale top_pattern rows don't keep rendering after the pattern
  // dissolves. Both calls are error-checked — a silent delete failure would
  // leave stale cache; a silent insert failure after a successful delete
  // leaves the user with an empty /insights until the next regen (falls
  // through to live compute, so UX is preserved but cache is cold).
  const { error: deleteError } = await supabase
    .from("derived_insights")
    .delete()
    .eq("user_id", userId);
  if (deleteError) {
    throw new Error(`insights-writer delete failed: ${deleteError.message}`);
  }

  if (rows.length === 0) return;

  const { error: insertError } = await supabase
    .from("derived_insights")
    .insert(rows);
  if (insertError) {
    // Distinguishing tag: delete-succeeded-but-insert-failed leaves user in
    // a temporarily blank cache state. Log once per cooldown.
    captureWithCooldown(
      new Error(
        `insights-writer insert failed after successful delete: ${insertError.message}`,
      ),
      { area: "insights", kind: "insert_after_delete" },
    );
    throw insertError;
  }
}
