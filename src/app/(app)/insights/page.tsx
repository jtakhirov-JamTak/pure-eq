// Pure EQ domain — replace in fork.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  PROFILE_DESCRIPTIONS,
  PROFILE_AVATAR_CLASSES,
} from "@/lib/onboarding";
import {
  checkInsightThresholds,
  getTopBlindSpot,
  getHowYouTendToLand,
  getPersonPatterns,
  HIGH_FIT_RECORD_TYPES,
  TEND_TO_LAND_HIGH_FIT,
  OBSERVATION_TAG_DESCRIPTIONS,
} from "@/lib/insights";
import type { ProfileType } from "@/types";

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check for fresh cached insights first (< 1 hour old).
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const { data: cachedInsights } = await supabase
    .from("derived_insights")
    .select("*")
    .eq("user_id", user.id)
    .limit(20);

  // eslint-disable-next-line react-hooks/purity -- server component, Date.now() is stable per request
  const nowMs = Date.now();
  const cacheAge = cachedInsights?.[0]?.generated_at
    ? nowMs - new Date(cachedInsights[0].generated_at).getTime()
    : Infinity;
  const useCache = cachedInsights && cachedInsights.length > 0 && cacheAge < ONE_HOUR_MS;

  // Parallel fetches: profile + (if cache stale) entry stats, observations, persons
  const [profileRes, rawRecordsRes, observationsRes, personsRes] =
    await Promise.all([
      supabase
        .from("user_profiles")
        .select("primary_profile, secondary_profile")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Skip heavy queries if cache is fresh
      useCache
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("raw_records")
            .select("record_type, created_at, person_id")
            .eq("user_id", user.id)
            .eq("is_complete", true)
            .is("deleted_at", null)
            .limit(1000),

      useCache
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("pattern_observations")
            .select("observation_tag, observed_at, observation_source, person_id")
            .eq("user_id", user.id)
            .order("observed_at", { ascending: false })
            .limit(500),

      supabase
        .from("persons")
        .select("person_id, display_name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(100),
    ]);

  const profile = profileRes.data;
  const persons = personsRes.data ?? [];
  const personNameMap = new Map(
    persons.map((p) => [p.person_id, p.display_name])
  );

  // If cache is fresh, reconstruct results from derived_insights rows.
  let blindSpot: ReturnType<typeof getTopBlindSpot> = null;
  let tendToLand: ReturnType<typeof getHowYouTendToLand> = null;
  let personPatterns: ReturnType<typeof getPersonPatterns> = [];
  let thresholdResult: ReturnType<typeof checkInsightThresholds>;
  let reviewEntries = 0;
  let rawRecordCount = 0;
  let finalPersonStats = new Map<string, { totalEntries: number; distinctDays: number; reviewEntries: number; repairEntries: number; displayName: string }>();

  if (useCache) {
    // Reconstruct from cache.
    const blindSpotRow = cachedInsights.find((r) => r.insight_type === "blind_spot");
    const tendToLandRow = cachedInsights.find((r) => r.insight_type === "tend_to_land");
    const personRows = cachedInsights.filter((r) => r.insight_type === "person_pattern");

    rawRecordCount = blindSpotRow?.evidence_count ?? tendToLandRow?.evidence_count ?? 0;

    if (blindSpotRow) {
      const tags = (blindSpotRow.supporting_pattern_ids as string[]) ?? [];
      const tag = tags[0] as import("@/types").ObservationTag;
      const desc = OBSERVATION_TAG_DESCRIPTIONS[tag];
      if (desc) {
        blindSpot = {
          tag,
          summary: blindSpotRow.summary_text,
          count: blindSpotRow.evidence_count,
          freshnessLabel: `Based on ${blindSpotRow.evidence_count} entries across ${blindSpotRow.distinct_days} days.`,
        };
      }
    }

    if (tendToLandRow) {
      const tags = (tendToLandRow.supporting_pattern_ids as string[]) ?? [];
      const topTag = tags[0] as import("@/types").ObservationTag;
      const counterTag = tags[1] as import("@/types").ObservationTag | undefined;
      tendToLand = {
        topPattern: topTag,
        summary: tendToLandRow.summary_text,
        counterPattern: counterTag && OBSERVATION_TAG_DESCRIPTIONS[counterTag]
          ? { tag: counterTag, summary: OBSERVATION_TAG_DESCRIPTIONS[counterTag].summary }
          : null,
        confidenceLevel: tendToLandRow.confidence_level as "emerging" | "established",
        freshnessLabel: `Based on ${tendToLandRow.evidence_count} entries across ${tendToLandRow.distinct_days} days.`,
      };
    }

    for (const row of personRows) {
      if (!row.person_id) continue;
      const tags = (row.supporting_pattern_ids as string[]) ?? [];
      const negTag = tags[0] as import("@/types").ObservationTag | undefined;
      const posTag = tags[1] as import("@/types").ObservationTag | undefined;
      const displayName = personNameMap.get(row.person_id) ?? "Someone";

      personPatterns.push({
        personId: row.person_id,
        topNegative: negTag && OBSERVATION_TAG_DESCRIPTIONS[negTag]?.direction === "negative"
          ? { tag: negTag, summary: OBSERVATION_TAG_DESCRIPTIONS[negTag].summary, count: row.evidence_count }
          : null,
        topPositive: posTag && OBSERVATION_TAG_DESCRIPTIONS[posTag]?.direction === "positive"
          ? { tag: posTag, summary: OBSERVATION_TAG_DESCRIPTIONS[posTag].summary, count: row.evidence_count }
          : null,
        confidenceLevel: row.confidence_level as "emerging" | "established",
        entryCount: row.evidence_count,
        freshnessLabel: `${row.evidence_count} entries across ${row.distinct_days} days.`,
      });

      finalPersonStats.set(row.person_id, {
        totalEntries: row.evidence_count,
        distinctDays: row.distinct_days,
        reviewEntries: 0,
        repairEntries: 0,
        displayName,
      });
    }

    // Threshold is "met" if we have cached insights.
    thresholdResult = {
      state: blindSpot || tendToLand ? "threshold_met" : "below_threshold",
      message: "",
      totalEntries: rawRecordCount,
    };
  } else {
    // Live computation (cache miss or stale).
    const rawRecords = rawRecordsRes.data ?? [];
    const observations = observationsRes.data ?? [];
    rawRecordCount = rawRecords.length;

    const distinctDays = new Set(
      rawRecords
        .filter((r) => r.created_at)
        .map((r) => r.created_at!.slice(0, 10))
    ).size;
    const eventTypes = [...new Set(rawRecords.map((r) => r.record_type))];
    const highFitEntries = rawRecords.filter((r) =>
      (HIGH_FIT_RECORD_TYPES as readonly string[]).includes(r.record_type)
    ).length;

    thresholdResult = checkInsightThresholds({
      totalEntries: rawRecords.length,
      distinctDays,
      eventTypes,
      highFitEntries,
    });

    blindSpot =
      thresholdResult.state === "threshold_met"
        ? getTopBlindSpot(observations, rawRecords.length)
        : null;

    const tendToLandHighFit = rawRecords.filter((r) =>
      (TEND_TO_LAND_HIGH_FIT as readonly string[]).includes(r.record_type)
    ).length;
    reviewEntries = rawRecords.filter(
      (r) => r.record_type === "review"
    ).length;

    tendToLand = getHowYouTendToLand(observations, {
      totalEntries: rawRecords.length,
      distinctDays,
      eventTypes,
      highFitEntries: tendToLandHighFit,
      reviewEntries,
    });

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

    finalPersonStats = new Map(
      [...personStatsAccum].map(([id, s]) => [
        id,
        {
          totalEntries: s.totalEntries,
          distinctDays: s.days.size,
          reviewEntries: s.reviewEntries,
          repairEntries: s.repairEntries,
          displayName: s.displayName,
        },
      ])
    );

    personPatterns = getPersonPatterns(observations, finalPersonStats);
  }

  const primary = profile?.primary_profile as ProfileType | undefined;
  const secondary = profile?.secondary_profile as ProfileType | undefined;

  return (
    <div className="px-5 pb-28 pt-8">
      <h2 className="text-xl font-bold text-zinc-900">Insights</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Your patterns, profile, and long-term learning.
      </p>

      {/* Communication Profile */}
      {primary ? (
        <ProfileCard primary={primary} secondary={secondary ?? null} />
      ) : (
        <div className="mt-8 rounded-xl border border-zinc-200 p-5">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Your Communication Profile
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            Complete onboarding to see your profile here.
          </p>
        </div>
      )}

      {/* Recurring Blind Spot */}
      {blindSpot ? (
        <BlindSpotCard blindSpot={blindSpot} />
      ) : (
        <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
          <p className="text-sm font-medium text-zinc-700">
            Recurring Blind Spot
          </p>
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
      )}

      {/* How You Tend to Land */}
      {tendToLand ? (
        <TendToLandCard result={tendToLand} />
      ) : (
        <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
          <p className="text-sm font-medium text-zinc-700">
            How You Tend to Land
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {rawRecordCount === 0
              ? "Not enough data yet"
              : reviewEntries < 2
              ? "Needs at least 2 Review entries to analyze how you come across."
              : "Keep using different modules to unlock this insight."}
          </p>
        </div>
      )}

      {/* People & Relationships */}
      {personPatterns.length > 0 ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-zinc-700">
            People &amp; Relationships
          </p>
          {personPatterns.map((pp) => (
            <PersonPatternCard
              key={pp.personId}
              result={pp}
              displayName={
                finalPersonStats.get(pp.personId)?.displayName ?? "Someone"
              }
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
          <p className="text-sm font-medium text-zinc-700">
            People &amp; Relationships
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {rawRecordCount === 0
              ? "Not enough data yet"
              : "Person-specific patterns will appear after more entries linked to the same person."}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- Profile Card ----------

function ProfileCard({
  primary,
  secondary,
}: {
  primary: ProfileType;
  secondary: ProfileType | null;
}) {
  const desc = PROFILE_DESCRIPTIONS[primary];
  const colorClass = PROFILE_AVATAR_CLASSES[primary];
  const name = primary.charAt(0).toUpperCase() + primary.slice(1);

  return (
    <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
        Your Communication Profile
      </p>

      <div className="mt-3 flex items-center gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white ${colorClass}`}
        >
          {primary.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold text-zinc-900">{name}</p>
          {secondary && (
            <p className="text-sm text-zinc-500">
              with{" "}
              {secondary.charAt(0).toUpperCase() + secondary.slice(1)}{" "}
              tendencies
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-xs font-medium uppercase text-zinc-500">
            Strength
          </p>
          <p className="mt-0.5 text-sm text-zinc-700">{desc.strength}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-zinc-500">
            Under stress
          </p>
          <p className="mt-0.5 text-sm text-zinc-700">{desc.stress}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-zinc-500">
            What will help most
          </p>
          <p className="mt-0.5 text-sm text-zinc-700">{desc.willHelpMost}</p>
        </div>
      </div>

      <Link
        href="/onboarding?retake=1"
        className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Retake Communication Profile
      </Link>
    </div>
  );
}

// ---------- Blind Spot Card ----------

function BlindSpotCard({
  blindSpot,
}: {
  blindSpot: { summary: string; count: number; freshnessLabel: string };
}) {
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-700">
          Recurring Blind Spot
        </p>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          Emerging
        </span>
      </div>

      <p className="mt-2 text-sm text-zinc-800">{blindSpot.summary}</p>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Seen in {blindSpot.count} entries
        </p>
        <p className="text-xs text-zinc-500">{blindSpot.freshnessLabel}</p>
      </div>
    </div>
  );
}

// ---------- "How You Tend to Land" Card ----------

function TendToLandCard({
  result,
}: {
  result: {
    summary: string;
    counterPattern: { summary: string } | null;
    confidenceLevel: "emerging" | "established";
    freshnessLabel: string;
  };
}) {
  const badgeColor =
    result.confidenceLevel === "established"
      ? "bg-green-100 text-green-700"
      : "bg-blue-100 text-blue-700";
  const borderColor =
    result.confidenceLevel === "established"
      ? "border-green-200 bg-green-50"
      : "border-blue-200 bg-blue-50";

  return (
    <div className={`mt-4 rounded-xl border p-5 ${borderColor}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-700">
          How You Tend to Land
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}
        >
          {result.confidenceLevel === "established"
            ? "Established"
            : "Emerging"}
        </span>
      </div>

      <p className="mt-2 text-sm text-zinc-800">{result.summary}</p>

      {result.counterPattern && (
        <p className="mt-2 text-sm text-zinc-600">
          At the same time, {result.counterPattern.summary.charAt(0).toLowerCase() + result.counterPattern.summary.slice(1)}
        </p>
      )}

      <p className="mt-3 text-xs text-zinc-500">{result.freshnessLabel}</p>
    </div>
  );
}

// ---------- Person Pattern Card ----------

function PersonPatternCard({
  result,
  displayName,
}: {
  result: {
    topNegative: { summary: string; count: number } | null;
    topPositive: { summary: string } | null;
    confidenceLevel: "emerging" | "established";
    freshnessLabel: string;
  };
  displayName: string;
}) {
  const badgeColor =
    result.confidenceLevel === "established"
      ? "bg-green-100 text-green-700"
      : "bg-purple-100 text-purple-700";
  const borderColor =
    result.confidenceLevel === "established"
      ? "border-green-200 bg-green-50"
      : "border-purple-200 bg-purple-50";

  return (
    <div className={`rounded-xl border p-5 ${borderColor}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-700">
          With {displayName}
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}
        >
          {result.confidenceLevel === "established"
            ? "Established"
            : "Emerging"}
        </span>
      </div>

      {result.topNegative && (
        <p className="mt-2 text-sm text-zinc-800">
          {result.topNegative.summary}
        </p>
      )}

      {result.topPositive && (
        <p className="mt-2 text-sm text-zinc-600">
          {result.topNegative ? "However, you also " : ""}
          {result.topNegative
            ? result.topPositive.summary.charAt(0).toLowerCase() + result.topPositive.summary.slice(1)
            : result.topPositive.summary}
        </p>
      )}

      <p className="mt-3 text-xs text-zinc-500">{result.freshnessLabel}</p>
    </div>
  );
}
