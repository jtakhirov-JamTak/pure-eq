// Pure EQ domain — replace in fork.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  PROFILE_DESCRIPTIONS,
  PROFILE_AVATAR_CLASSES,
} from "@/lib/onboarding";
import {
  checkInsightThresholds,
  getTopBlindSpot,
  HIGH_FIT_RECORD_TYPES,
} from "@/lib/insights";
import type { ProfileType } from "@/types";

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Parallel fetches: profile, entry stats, pattern observations
  const [profileRes, rawRecordsRes, observationsRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("primary_profile, secondary_profile")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("raw_records")
      .select("record_type, created_at")
      .eq("user_id", user.id)
      .eq("is_complete", true)
      .is("deleted_at", null)
      .limit(1000), // Safety cap; RPC upgrade when needed

    supabase
      .from("pattern_observations")
      .select("observation_tag, observed_at, observation_source")
      .eq("user_id", user.id)
      .order("observed_at", { ascending: false })
      .limit(500), // Safety cap; sufficient for v0 scale
  ]);

  const profile = profileRes.data;
  const rawRecords = rawRecordsRes.data ?? [];
  const observations = observationsRes.data ?? [];

  // Compute entry stats
  const distinctDays = new Set(
    rawRecords
      .filter((r) => r.created_at)
      .map((r) => r.created_at!.slice(0, 10))
  ).size;
  const eventTypes = [...new Set(rawRecords.map((r) => r.record_type))];
  const highFitEntries = rawRecords.filter((r) =>
    (HIGH_FIT_RECORD_TYPES as readonly string[]).includes(r.record_type)
  ).length;

  const thresholdResult = checkInsightThresholds({
    totalEntries: rawRecords.length,
    distinctDays,
    eventTypes,
    highFitEntries,
  });

  // Blind spot: only compute if threshold met
  const blindSpot =
    thresholdResult.state === "threshold_met"
      ? getTopBlindSpot(observations, rawRecords.length)
      : null;

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

      {/* How You Tend to Land — deferred */}
      <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-700">
          How You Tend to Land
        </p>
        <p className="mt-1 text-sm text-zinc-500">Not enough data yet</p>
      </div>

      {/* People & Relationships — deferred */}
      <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-5">
        <p className="text-sm font-medium text-zinc-700">
          People &amp; Relationships
        </p>
        <p className="mt-1 text-sm text-zinc-500">Not enough data yet</p>
      </div>
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
