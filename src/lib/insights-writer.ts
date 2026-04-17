// Regenerate cached insights and write to derived_insights table.
// Called fire-and-forget after observation extraction in coach + tools routes.
// Insights page reads these cached results first, falls back to live computation if stale.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  checkInsightThresholds,
  getTopBlindSpot,
  getHowYouTendToLand,
  getPersonPatterns,
  HIGH_FIT_RECORD_TYPES,
  TEND_TO_LAND_HIGH_FIT,
  OBSERVATION_TAG_DESCRIPTIONS,
} from "@/lib/insights";

const GENERATOR_VERSION = "v1";

export async function regenerateInsights(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  // 1. Fetch all data needed (same queries as insights page).
  const [rawRecordsRes, observationsRes, personsRes] = await Promise.all([
    supabase
      .from("raw_records")
      .select("record_type, created_at, person_id")
      .eq("user_id", userId)
      .eq("is_complete", true)
      .is("deleted_at", null)
      .limit(1000),
    supabase
      .from("pattern_observations")
      .select("observation_tag, observed_at, observation_source, person_id")
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
  const observations = observationsRes.data ?? [];
  const persons = personsRes.data ?? [];

  if (rawRecords.length === 0) return;

  // 2. Compute entry stats.
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

  const now = new Date().toISOString();
  const periodStart =
    rawRecords
      .filter((r) => r.created_at)
      .map((r) => r.created_at!)
      .sort()[0] ?? now;

  const baseRow = {
    user_id: userId,
    generator_version: GENERATOR_VERSION,
    generated_at: now,
    period_start: periodStart,
    period_end: now,
    time_window_type: "all_time",
    event_types_used: eventTypes,
  };

  // 3. Compute all insight types.
  const rows: Database["public"]["Tables"]["derived_insights"]["Insert"][] = [];

  // 3a. Blind spot.
  if (thresholdResult.state === "threshold_met") {
    const blindSpot = getTopBlindSpot(observations, rawRecords.length);
    if (blindSpot) {
      rows.push({
        ...baseRow,
        insight_type: "blind_spot",
        person_id: null,
        summary_text: blindSpot.summary,
        confidence_level: "emerging",
        evidence_count: blindSpot.count,
        distinct_days: distinctDays,
        supporting_pattern_ids: [blindSpot.tag],
      });
    }
  }

  // 3b. How You Tend to Land.
  const tendToLandHighFit = rawRecords.filter((r) =>
    (TEND_TO_LAND_HIGH_FIT as readonly string[]).includes(r.record_type),
  ).length;
  const reviewEntries = rawRecords.filter(
    (r) => r.record_type === "review",
  ).length;

  const tendToLand = getHowYouTendToLand(observations, {
    totalEntries: rawRecords.length,
    distinctDays,
    eventTypes,
    highFitEntries: tendToLandHighFit,
    reviewEntries,
  });

  if (tendToLand) {
    const patternIds: string[] = [tendToLand.topPattern];
    if (tendToLand.counterPattern) patternIds.push(tendToLand.counterPattern.tag);

    rows.push({
      ...baseRow,
      insight_type: "tend_to_land",
      person_id: null,
      summary_text: tendToLand.summary,
      confidence_level: tendToLand.confidenceLevel,
      evidence_count: rawRecords.length,
      distinct_days: distinctDays,
      supporting_pattern_ids: patternIds,
    });
  }

  // 3c. Per-person patterns.
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

  const personPatterns = getPersonPatterns(observations, finalPersonStats);
  for (const pp of personPatterns) {
    const patternIds: string[] = [];
    if (pp.topNegative) patternIds.push(pp.topNegative.tag);
    if (pp.topPositive) patternIds.push(pp.topPositive.tag);

    const personDesc = OBSERVATION_TAG_DESCRIPTIONS[pp.topNegative?.tag ?? pp.topPositive?.tag ?? "defended_intent_early"];
    const summaryText = pp.topNegative?.summary ?? pp.topPositive?.summary ?? "";

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

  if (rows.length === 0) return;

  // 4. Upsert: delete existing rows for this user, then insert fresh.
  // This is simpler than per-type upsert and avoids stale person_pattern rows
  // when a person drops below threshold.
  await supabase
    .from("derived_insights")
    .delete()
    .eq("user_id", userId);

  await supabase
    .from("derived_insights")
    .insert(rows);
}
