// Pure EQ domain — replace in fork.
import * as Sentry from "@sentry/nextjs";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requirePaidAccessPage } from "@/lib/require-access";
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
  getPersonPatterns,
  HIGH_FIT_RECORD_TYPES,
  isComparatorSnapshot,
  isPatternSnapshot,
  OBSERVATION_TAG_COPY,
  pickTopPerson,
  shouldRenderComparatorLine,
  SHIFT_STATUS_COPY,
  COMPARATOR_FRAMING_LINE,
  type ComparatorSnapshot,
  type PatternSnapshot,
  type PersonPickCandidate,
} from "@/lib/insights";
import { GENERATOR_VERSION } from "@/lib/insights-writer";
import type { ObservationTag, ProfileType } from "@/types";
import { StyleBox } from "@/components/insights/StyleBox";
import { MainPatternBox } from "@/components/insights/MainPatternBox";
import { WithPersonBox } from "@/components/insights/WithPersonBox";
import { SkyBackground } from "@/components/brand/SkyBackground";

const ONE_HOUR_MS = 60 * 60 * 1000;

// Cooldown-latched capture for the 5 parallel Supabase reads. Without this,
// a single request during a DB outage would swallow .error silently and the
// user would see an empty Insights page with zero operator signal (same trap
// flagged in CLAUDE.md: "maybeSingle(), bare .select(), upsert, update do NOT
// throw on DB errors"). Per-kind Map so a single failing query doesn't mask
// captures from other kinds.
const READ_CAPTURE_COOLDOWN_MS = 5 * 60 * 1000;
const lastReadCaptures = new Map<string, number>();

function captureInsightsRead(err: unknown, kind: string): void {
  const now = Date.now();
  const last = lastReadCaptures.get(kind) ?? 0;
  if (now - last < READ_CAPTURE_COOLDOWN_MS) return;
  lastReadCaptures.set(kind, now);
  Sentry.captureException(err, { tags: { area: "insights", kind } });
}

export default async function InsightsPage() {
  const t0 = Date.now();
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Paid-only surface (see docs/access_route_matrix.md).
  await requirePaidAccessPage(user);

  // 1. Fetch cache + all live inputs.
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

  // Inspect .error on each query. PostgREST returns { data: null, error } on
  // RLS mis-config / schema drift / transient outages rather than throwing.
  // Cooldown-latched capture prevents flood on repeated failures.
  if (cachedRes.error) {
    captureInsightsRead(
      new Error("derived_insights_read_failed"),
      "derived_insights",
    );
  }
  if (rawRecordsRes.error) {
    captureInsightsRead(
      new Error("raw_records_read_failed"),
      "raw_records",
    );
  }
  if (observationsRes.error) {
    captureInsightsRead(
      new Error("pattern_observations_read_failed"),
      "pattern_observations",
    );
  }
  if (personsRes.error) {
    captureInsightsRead(new Error("persons_read_failed"), "persons");
  }
  if (flagRes.error) {
    captureInsightsRead(
      new Error("user_feature_flags_read_failed"),
      "user_feature_flags",
    );
  }

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

  // 3. Compute thresholdResult live (always).
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
        const versionOk =
          topPatternRow.generator_version === GENERATOR_VERSION;
        if (versionOk && isPatternSnapshot(topPatternRow.metadata_json)) {
          snapshot = topPatternRow.metadata_json;
        } else {
          snapshot = computePatternSnapshot(observations, nowDate);
        }
      }
    } else {
      snapshot = computePatternSnapshot(observations, nowDate);
    }
  }

  // 4b. Comparator snapshot. Compute runs for all qualifying users; the Box 2
  // framing line is gated by shouldRenderComparatorLine (flag + established).
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

  const comparatorLine = shouldRenderComparatorLine({
    showComparator,
    snapshot: comparator,
  })
    ? COMPARATOR_FRAMING_LINE
    : null;

  // 5. Person patterns (cache or live). Collected into PersonPickCandidate
  // shape so pickTopPerson can select the single strongest-evidence person.
  // Symmetric with top_pattern: cache rows must pass generator_version.
  // If any person row fails the check we fall through to live-compute rather
  // than render a mix of stale and fresh rows.
  let personCandidates: PersonPickCandidate[] = [];
  let personCandidatesFromCache = false;
  if (cacheIsFresh) {
    const personRows = cachedInsights.filter(
      (r) => r.insight_type === "person_pattern",
    );
    const allVersionOk = personRows.every(
      (r) => r.generator_version === GENERATOR_VERSION,
    );
    if (allVersionOk) {
      personCandidatesFromCache = true;
      for (const row of personRows) {
        if (!row.person_id) continue;
        const tags = (row.supporting_pattern_ids as string[]) ?? [];
        const negTag = (tags[0] || undefined) as ObservationTag | undefined;
        const posTag = (tags[1] || undefined) as ObservationTag | undefined;
        const displayName = personNameMap.get(row.person_id) ?? "Someone";

        const negCopy = negTag ? OBSERVATION_TAG_COPY[negTag] : undefined;
        const posCopy = posTag ? OBSERVATION_TAG_COPY[posTag] : undefined;

        const entries = row.evidence_count;
        const days = row.distinct_days;
        // Runtime-narrow the string column. Migration 0018 enforces the enum
        // via CHECK, so this should never fall through today — but matches
        // the isPatternSnapshot/isComparatorSnapshot defensive-read
        // discipline for reads-from-DB values used in downstream filters.
        const confidenceLevel: "emerging" | "established" =
          row.confidence_level === "established" ? "established" : "emerging";

        personCandidates.push({
          personId: row.person_id,
          displayName,
          topNegative:
            negTag && negCopy?.direction === "negative"
              ? { tag: negTag, summary: negCopy.pattern, count: entries }
              : null,
          topPositive:
            posTag && posCopy?.direction === "positive"
              ? { tag: posTag, summary: posCopy.pattern, count: entries }
              : null,
          confidenceLevel,
          distinctEntries: entries,
          distinctDays: days,
        });
      }
    }
  }
  if (!personCandidatesFromCache) {
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
    personCandidates = liveResults.map((pp) => {
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

  const topPerson = pickTopPerson(personCandidates);
  const topPersonNegCopy = topPerson?.topNegative
    ? OBSERVATION_TAG_COPY[topPerson.topNegative.tag] ?? null
    : null;
  const topPersonPosCopy = topPerson?.topPositive
    ? OBSERVATION_TAG_COPY[topPerson.topPositive.tag] ?? null
    : null;

  // Fallback to "steady" copy if the cached row has an unknown verdict
  // string (legacy generator or shape drift). PatternVerdict is a union type,
  // but metadata_json is jsonb so TS can't enforce it at read time.
  const shiftLine = snapshot
    ? SHIFT_STATUS_COPY[snapshot.evolution.verdict] ??
      SHIFT_STATUS_COPY.steady
    : "";

  const primary = profile?.primary_profile as ProfileType | undefined;
  const secondary = profile?.secondary_profile as ProfileType | null;

  console.log(`[perf] insights ${Date.now() - t0}ms`);
  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <SkyBackground variant="calm" />

      <div className="pt-2">
        <span className="inline-block rounded-pill bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-white">
          Insights
        </span>
        <h1
          className="mt-2.5 font-display text-[32px] leading-[1.08] text-ink"
          style={{ letterSpacing: "-1px" }}
        >
          Your <span className="italic">patterns</span> are who you are.
        </h1>
      </div>

      {primary ? (
        <StyleBox
          primary={primary}
          secondary={secondary ?? null}
          description={PROFILE_DESCRIPTIONS[primary]}
          avatarColorClass={PROFILE_AVATAR_CLASSES[primary]}
        />
      ) : (
        <div className="mt-4 rounded-card-sm bg-surface p-5 shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
            Your style
          </p>
          <p className="mt-2 text-[13px] font-medium text-ink-soft">
            Complete onboarding to see your profile here.
          </p>
        </div>
      )}

      {thresholdResult.state !== "threshold_met" ? (
        <div className="mt-4 rounded-card-sm bg-surface p-5 shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
            Your main pattern
          </p>
          <p className="mt-2 text-[13px] font-medium text-ink-soft">
            {thresholdResult.message}
          </p>
        </div>
      ) : snapshot ? (
        <MainPatternBox
          copy={snapshot.copy}
          distinctEntries={snapshot.distinctEntries}
          distinctDays={snapshot.distinctDays}
          evolution={snapshot.evolution}
          counterObservations={snapshot.evolution.counterObservations}
          comparatorLine={comparatorLine}
          shiftLine={shiftLine}
        />
      ) : (
        <div className="mt-4 rounded-card-sm bg-surface p-5 shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
            Your main pattern
          </p>
          <p className="mt-2 text-[13px] font-medium text-ink-soft">
            Your first pattern will surface once two entries share the same
            behavioral tag.
          </p>
        </div>
      )}

      {topPerson ? (
        <WithPersonBox
          displayName={topPerson.displayName}
          copy={topPersonNegCopy}
          positiveCopy={topPersonPosCopy}
          distinctEntries={topPerson.distinctEntries}
          distinctDays={topPerson.distinctDays}
        />
      ) : null}
    </div>
  );
}
