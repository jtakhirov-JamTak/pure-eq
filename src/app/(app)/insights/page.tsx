// Pure EQ domain — replace in fork.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  PROFILE_DESCRIPTIONS,
  PROFILE_AVATAR_CLASSES,
  getLatestProfile,
} from "@/lib/onboarding";
import {
  checkInsightThresholds,
  computePatternSnapshot,
  computeReflectionRegulationGap,
  enrichObservations,
  gateComparatorRender,
  getPatternEvolution,
  getPersonPatterns,
  HIGH_FIT_RECORD_TYPES,
  isComparatorSnapshot,
  isPatternSnapshot,
  OBSERVATION_TAG_COPY,
  type ComparatorSnapshot,
  type PatternSnapshot,
} from "@/lib/insights";
import { GENERATOR_VERSION } from "@/lib/insights-writer";
import type { ObservationTag, ProfileType } from "@/types";
import { PatternCard } from "@/components/insights/PatternCard";
import { PeriodSummaryRow } from "@/components/insights/PeriodSummaryRow";
import { ProfileCardCollapsed } from "@/components/insights/ProfileCardCollapsed";
import { ComparatorCard } from "@/components/insights/ComparatorCard";
import { PersonPatternCard } from "@/components/insights/PersonPatternCard";

const ONE_HOUR_MS = 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 1. Fetch cache + all live inputs. Period summary always lives so we need
  // raw_records + observations regardless of cache state.
  const [cachedRes, profile, rawRecordsRes, observationsRes, personsRes, flagRes] =
    await Promise.all([
      supabase
        .from("derived_insights")
        .select("*")
        .eq("user_id", user.id)
        .order("generated_at", { ascending: false })
        .limit(20),
      getLatestProfile(supabase, user.id),
      supabase
        .from("raw_records")
        .select("raw_record_id, record_type, created_at, person_id")
        .eq("user_id", user.id)
        .eq("is_complete", true)
        .is("deleted_at", null)
        .limit(1000),
      supabase
        .from("pattern_observations")
        .select(
          "observation_tag, observed_at, observation_source, person_id, source_raw_record_id",
        )
        .eq("user_id", user.id)
        .order("observed_at", { ascending: false })
        .limit(500),
      supabase
        .from("persons")
        .select("person_id, display_name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(100),
      // Feature flag row for this user. Missing row = false (default).
      // RLS policy allows user to SELECT own row; writes are service-role only.
      supabase
        .from("user_feature_flags")
        .select("show_comparator")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const cachedInsights = cachedRes.data ?? [];
  const rawRecords = rawRecordsRes.data ?? [];
  const rawObservations = observationsRes.data ?? [];
  const persons = personsRes.data ?? [];
  const showComparator = flagRes.data?.show_comparator === true;

  const personNameMap = new Map(
    persons.map((p) => [p.person_id, p.display_name]),
  );

  // 2. Enrich observations (shared helper with insights-writer).
  const { observations, personObservations } = enrichObservations(
    rawObservations,
    rawRecords,
  );

  // 3. Compute thresholdResult live (always) — single source of truth for
  // "does this user have enough data for insights yet?"
  const distinctDaysAllTime = new Set(
    rawRecords
      .filter((r) => r.created_at)
      .map((r) => r.created_at!.slice(0, 10)),
  ).size;
  const eventTypesAllTime = [
    ...new Set(rawRecords.map((r) => r.record_type)),
  ];
  const highFitEntries = rawRecords.filter((r) =>
    (HIGH_FIT_RECORD_TYPES as readonly string[]).includes(r.record_type),
  ).length;
  const thresholdResult = checkInsightThresholds({
    totalEntries: rawRecords.length,
    distinctDays: distinctDaysAllTime,
    eventTypes: eventTypesAllTime,
    highFitEntries,
  });

  // 4. Resolve PatternSnapshot (cache-first, live fallback).
  // eslint-disable-next-line react-hooks/purity -- server component; per-request timestamp
  const nowMs = Date.now();
  const nowDate = new Date(nowMs);
  const cacheAge =
    cachedInsights.length > 0
      ? nowMs - new Date(cachedInsights[0].generated_at).getTime()
      : Infinity;
  const cacheIsFresh = cacheAge < ONE_HOUR_MS;

  let snapshot: PatternSnapshot | null = null;
  if (thresholdResult.state === "threshold_met") {
    if (cacheIsFresh) {
      const topPatternRow = cachedInsights.find(
        (r) => r.insight_type === "top_pattern",
      );
      if (topPatternRow) {
        // Two-layer guard:
        //   (a) generator_version match — rejects legacy shapes after a bump
        //   (b) runtime shape check — rejects hand-edited or partial rows
        // Fall through to live compute on any mismatch rather than render
        // a broken card.
        const versionOk =
          topPatternRow.generator_version === GENERATOR_VERSION;
        if (versionOk && isPatternSnapshot(topPatternRow.metadata_json)) {
          snapshot = topPatternRow.metadata_json;
        } else {
          snapshot = computePatternSnapshot(observations, nowDate);
        }
      }
      // else: cache is fresh but no top_pattern row — generator ran and found
      // no qualifying pattern. Render the empty state.
    } else {
      snapshot = computePatternSnapshot(observations, nowDate);
    }
  }

  // 4b. Comparator snapshot (Reflection > Regulation gap). Compute runs for
  // all users; render is gated by user_feature_flags.show_comparator (below).
  // Cache-first with the same two-layer guard as top_pattern:
  //   (a) generator_version match, (b) isComparatorSnapshot shape check.
  // Fall through to live compute on any mismatch.
  //
  // Cache-fresh + no gap row = the writer just decided this user doesn't
  // qualify; trust it and skip recompute (saves CPU on every page load for
  // the majority of users who won't qualify).
  let comparator: ComparatorSnapshot | null = null;
  if (cacheIsFresh) {
    const gapRow = cachedInsights.find(
      (r) => r.insight_type === "reflection_regulation_gap",
    );
    if (gapRow) {
      const versionOk = gapRow.generator_version === GENERATOR_VERSION;
      if (versionOk && isComparatorSnapshot(gapRow.metadata_json)) {
        comparator = gapRow.metadata_json;
      } else {
        comparator = computeReflectionRegulationGap(
          observations,
          rawRecords.map((r) => ({
            record_type: r.record_type,
            created_at: r.created_at,
          })),
          nowDate,
        );
      }
    }
    // else: writer's authoritative — non-qualifying user, no recompute.
  } else {
    comparator = computeReflectionRegulationGap(
      observations,
      rawRecords.map((r) => ({
        record_type: r.record_type,
        created_at: r.created_at,
      })),
      nowDate,
    );
  }
  const renderComparator =
    comparator !== null &&
    gateComparatorRender({
      showComparator,
      qualifies: comparator.qualifies,
    });

  // 5. Person patterns (cache or live). Spec 2 renders via PersonPatternCard
  // using TagCopy lookups — distinctEntries + distinctDays piped through so
  // the card can render its proof line directly.
  type PersonPatternDisplay = {
    personId: string;
    displayName: string;
    topNegative: { tag: ObservationTag; summary: string; count: number } | null;
    topPositive: { tag: ObservationTag; summary: string; count: number } | null;
    confidenceLevel: "emerging" | "established";
    distinctEntries: number;
    distinctDays: number;
  };

  let personPatterns: PersonPatternDisplay[] = [];
  if (cacheIsFresh) {
    const personRows = cachedInsights.filter(
      (r) => r.insight_type === "person_pattern",
    );
    for (const row of personRows) {
      if (!row.person_id) continue;
      const tags = (row.supporting_pattern_ids as string[]) ?? [];
      // Positional encoding (writer): [negTag, posTag], empty string = absent.
      // Treat empty string as undefined so direction checks fall through.
      const negTag = (tags[0] || undefined) as ObservationTag | undefined;
      const posTag = (tags[1] || undefined) as ObservationTag | undefined;
      const displayName = personNameMap.get(row.person_id) ?? "Someone";

      const negCopy = negTag ? OBSERVATION_TAG_COPY[negTag] : undefined;
      const posCopy = posTag ? OBSERVATION_TAG_COPY[posTag] : undefined;

      const entries = row.evidence_count;
      const days = row.distinct_days;

      personPatterns.push({
        personId: row.person_id,
        displayName,
        topNegative:
          negTag && negCopy?.direction === "negative"
            ? {
                tag: negTag,
                summary: negCopy.pattern,
                count: entries,
              }
            : null,
        topPositive:
          posTag && posCopy?.direction === "positive"
            ? {
                tag: posTag,
                summary: posCopy.pattern,
                count: entries,
              }
            : null,
        confidenceLevel: row.confidence_level as "emerging" | "established",
        distinctEntries: entries,
        distinctDays: days,
      });
    }
  } else {
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

    const liveResults = getPersonPatterns(personObservations, finalPersonStats);
    personPatterns = liveResults.map((pp) => {
      const stats = finalPersonStats.get(pp.personId);
      return {
        personId: pp.personId,
        displayName: stats?.displayName ?? "Someone",
        topNegative: pp.topNegative,
        topPositive: pp.topPositive,
        confidenceLevel: pp.confidenceLevel,
        distinctEntries: stats?.totalEntries ?? pp.entryCount,
        distinctDays: stats?.distinctDays ?? 0,
      };
    });
  }

  // 6. Period summary (always live).
  const currentCutoffMs = nowMs - FOURTEEN_DAYS_MS;
  const rawInPeriod = rawRecords.filter((r) => {
    if (!r.created_at) return false;
    return new Date(r.created_at).getTime() >= currentCutoffMs;
  });
  const entriesThisPeriod = rawInPeriod.length;
  const daysThisPeriod = new Set(
    rawInPeriod.map((r) => r.created_at!.slice(0, 10)),
  ).size;

  let topPatternChange: string | null = null;
  if (snapshot) {
    const { verdict, currentWindow, priorWindow } = snapshot.evolution;
    const delta = currentWindow.count - priorWindow.count;
    if (verdict === "new") {
      topPatternChange = "Your top pattern is new this period";
    } else if (verdict === "gone") {
      topPatternChange = "Your top pattern didn't appear";
    } else if (verdict === "dormant") {
      topPatternChange = "Your top pattern hasn't appeared recently";
    } else if (verdict === "increasing") {
      topPatternChange = `Your top pattern appeared ${delta} more ${delta === 1 ? "time" : "times"}`;
    } else if (verdict === "decreasing") {
      topPatternChange = `Your top pattern appeared ${-delta} fewer ${-delta === 1 ? "time" : "times"}`;
    } else {
      topPatternChange = "Your top pattern is steady";
    }
  }

  const newPatterns: string[] = [];
  const disappearedPatterns: string[] = [];
  // Skip the top-pattern tag so PeriodSummaryRow doesn't repeat "Your top
  // pattern is new" AND "New: <same pattern>" in the same sentence.
  const topTag = snapshot?.tag;
  for (const [tagKey, copy] of Object.entries(OBSERVATION_TAG_COPY)) {
    if (copy.direction !== "negative") continue;
    const tag = tagKey as ObservationTag;
    if (tag === topTag) continue;
    const ev = getPatternEvolution(observations, tag, nowDate);
    const label = copy.pattern.replace(/\.$/, "");
    if (ev.verdict === "new" && newPatterns.length < 2) {
      newPatterns.push(label);
    } else if (ev.verdict === "gone" && disappearedPatterns.length < 2) {
      disappearedPatterns.push(label);
    }
  }

  const primary = profile?.primary_profile as ProfileType | undefined;
  const secondary = profile?.secondary_profile as ProfileType | null;

  return (
    <div className="px-5 pb-28 pt-8">
      <h2 className="text-xl font-bold text-zinc-900">Insights</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Your patterns, profile, and long-term learning.
      </p>

      {/* Period summary (always live) */}
      <PeriodSummaryRow
        entriesThisPeriod={entriesThisPeriod}
        daysThisPeriod={daysThisPeriod}
        topPatternChange={topPatternChange}
        newPatterns={newPatterns}
        disappearedPatterns={disappearedPatterns}
      />

      {/* Pattern card or its empty state */}
      {thresholdResult.state !== "threshold_met" ? (
        <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
          <p className="text-sm font-medium text-zinc-700">Pattern</p>
          <p className="mt-1 text-sm text-zinc-500">
            {thresholdResult.state === "no_entries"
              ? "Not enough data yet"
              : thresholdResult.message}
          </p>
          {thresholdResult.state === "no_entries" && (
            <p className="mt-2 text-xs text-zinc-500">
              {thresholdResult.message}
            </p>
          )}
        </div>
      ) : snapshot ? (
        <PatternCard
          copy={snapshot.copy}
          distinctEntries={snapshot.distinctEntries}
          distinctDays={snapshot.distinctDays}
          evolution={snapshot.evolution}
          counterObservations={snapshot.evolution.counterObservations}
        />
      ) : (
        <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
          <p className="text-sm font-medium text-zinc-700">Pattern</p>
          <p className="mt-1 text-sm text-zinc-500">
            Your first pattern will surface once two entries share the same
            behavioral tag.
          </p>
        </div>
      )}

      {/* Reflection > Regulation comparator (flag-gated). Compute already
          persisted for qualifying users regardless of flag; this surface is
          the render-side gate. renderComparator implies comparator !== null. */}
      {renderComparator ? (
        <ComparatorCard
          reflectionScore={comparator!.reflectionScore}
          regulationScore={comparator!.regulationScore}
          reviewCount={comparator!.reviewCount}
          reactiveCount={comparator!.reactiveCount}
          distinctDays={comparator!.distinctDays}
          evolution={comparator!.evolution}
        />
      ) : null}

      {/* Per-person patterns (Spec 2: refreshed to 5-field visual language) */}
      {personPatterns.length > 0 ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-zinc-700">
            People &amp; Relationships
          </p>
          {personPatterns.map((pp) => {
            const negCopy = pp.topNegative
              ? OBSERVATION_TAG_COPY[pp.topNegative.tag] ?? null
              : null;
            const posCopy = pp.topPositive
              ? OBSERVATION_TAG_COPY[pp.topPositive.tag] ?? null
              : null;
            return (
              <PersonPatternCard
                key={pp.personId}
                displayName={pp.displayName}
                copy={negCopy}
                positiveCopy={posCopy}
                distinctEntries={pp.distinctEntries}
                distinctDays={pp.distinctDays}
              />
            );
          })}
        </div>
      ) : thresholdResult.state === "threshold_met" ? (
        <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
          <p className="text-sm font-medium text-zinc-700">
            People &amp; Relationships
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Person-specific patterns will appear after more entries linked to
            the same person.
          </p>
        </div>
      ) : null}

      {/* Baseline (demoted from full profile card) */}
      {primary ? (
        <ProfileCardCollapsed
          primary={primary}
          secondary={secondary ?? null}
          description={PROFILE_DESCRIPTIONS[primary]}
          avatarColorClass={PROFILE_AVATAR_CLASSES[primary]}
        />
      ) : (
        <div className="mt-4 rounded-xl border border-zinc-200 p-5">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Baseline
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            Complete onboarding to see your profile here.
          </p>
        </div>
      )}
    </div>
  );
}

