// Pure EQ domain — replace in fork.
//
// /insights renders two cards:
//   1. StyleBox — profile from the 9-question quiz (unchanged)
//   2. Weekly reflection — auto-generated once per 7 days; client kicks
//      POST /api/insights/generate on mount when no fresh row exists.
//
// Cost-wise, loading this page repeatedly inside a 7-day window is free:
// the API endpoint's idempotency short-circuit returns the cached row
// without calling Claude.
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requirePaidAccessPage } from "@/lib/require-access";
import {
  PROFILE_DESCRIPTIONS,
  PROFILE_AVATAR_CLASSES,
  getLatestProfile,
} from "@/lib/onboarding";
import type { ProfileType } from "@/types";
import { StyleBox } from "@/components/insights/StyleBox";
import { ReflectionCard } from "@/components/insights/ReflectionCard";
import { ReflectionKickoff } from "@/components/insights/ReflectionKickoff";
import { SkyBackground } from "@/components/brand/SkyBackground";
import {
  GENERATOR_VERSION,
  IDEMPOTENCY_WINDOW_MS,
} from "@/lib/insights/generate";
import { reflectionOutputSchema } from "@/lib/ai/schemas";
import type { WeeklyReflectionRow } from "@/lib/insights/types";

export default async function InsightsPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  await requirePaidAccessPage(user);

  // Fetch profile + latest weekly_reflections row in parallel. The
  // `weekly_reflections` cast bypasses the generated Database types —
  // they'll include the table after migration 0022 lands + db:types
  // regenerates, at which point the cast can be dropped.
  const db = supabase as unknown as SupabaseClient;
  const [profile, latestReflectionRes] = await Promise.all([
    getLatestProfile(supabase, user.id),
    db
      .from("weekly_reflections")
      .select("generated_at, generator_version, ai_json")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (latestReflectionRes.error) {
    // Capture with cooldown-latched pattern per CLAUDE.md — but a single
    // call here (not per-request across the instance) is fine because it's
    // one query. Log + fall through to kickoff.
    Sentry.captureException(
      new Error("weekly_reflections_read_failed"),
      { tags: { area: "insights", kind: "weekly_reflections_read" } },
    );
  }

  const primary = profile?.primary_profile as ProfileType | undefined;
  const secondary = profile?.secondary_profile as ProfileType | null;

  // Decide whether the server-side row is fresh enough to render directly,
  // or whether we should delegate to ReflectionKickoff (which auto-POSTs).
  // "Fresh" = within the 7-day idempotency window AND generator_version
  // matches the current code — a bumped generator_version is a re-compute
  // signal (symmetric read-side guard per Playbook §16.17).
  const latest = latestReflectionRes.data as Pick<
    WeeklyReflectionRow,
    "generated_at" | "generator_version" | "ai_json"
  > | null;
  let freshReflection:
    | { generatedAt: string; reflection: import("@/lib/ai/schemas").ReflectionOutput }
    | null = null;
  let hasStaleCached = false;

  if (latest) {
    const ageMs = Date.now() - new Date(latest.generated_at).getTime();
    const versionOk = latest.generator_version === GENERATOR_VERSION;
    const parsed = reflectionOutputSchema.safeParse(latest.ai_json);
    if (ageMs < IDEMPOTENCY_WINDOW_MS && versionOk && parsed.success) {
      freshReflection = {
        generatedAt: latest.generated_at,
        reflection: parsed.data,
      };
    } else {
      hasStaleCached = true;
    }
  }

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

      {freshReflection ? (
        <ReflectionCard
          reflection={freshReflection.reflection}
          generatedAt={freshReflection.generatedAt}
        />
      ) : (
        <ReflectionKickoff hasStaleCached={hasStaleCached} />
      )}
    </div>
  );
}
