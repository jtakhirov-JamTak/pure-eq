// Pure EQ domain — replace in fork.
//
// /insights renders:
//   1. StyleBox — profile from the 9-question quiz
//   2. Weekly reflection — auto-generated once per 7 days; client kicks
//      POST /api/insights/generate on mount when no fresh row exists.
//   3. Open conversations — list of active threads, if any exist.
//
// Cost-wise, loading this page repeatedly inside a 7-day window is free:
// the API endpoint's idempotency short-circuit returns the cached row
// without calling Claude.
import Link from "next/link";
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
import { captureServerRead } from "@/lib/read-capture";

export default async function InsightsPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  await requirePaidAccessPage(user);

  const [profile, latestReflectionRes, threadsRes, personsRes] = await Promise.all([
    getLatestProfile(supabase, user.id),
    supabase
      .from("weekly_reflections")
      .select("generated_at, generator_version, ai_json")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("conversation_threads")
      .select("thread_id, status, person_id, last_activity_at")
      .eq("user_id", user.id)
      .in("status", ["open", "stabilizing"])
      .order("last_activity_at", { ascending: false })
      .limit(3),
    supabase
      .from("persons")
      .select("person_id, display_name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(100),
  ]);

  if (latestReflectionRes.error) {
    captureServerRead(
      "insights",
      "weekly_reflections_read",
      new Error("weekly_reflections_read_failed"),
    );
  }
  if (threadsRes.error) {
    captureServerRead(
      "insights",
      "conversation_threads_read",
      new Error("conversation_threads_read_failed"),
    );
  }
  if (personsRes.error) {
    captureServerRead(
      "insights",
      "persons_read",
      new Error("persons_read_failed"),
    );
  }

  const primary = profile?.primary_profile as ProfileType | undefined;
  const secondary = profile?.secondary_profile as ProfileType | null;

  const threads = threadsRes.data ?? [];
  const personMap = new Map(
    (personsRes.data ?? []).map((p) => [p.person_id, p.display_name]),
  );

  // Decide whether the server-side row is fresh enough to render directly,
  // or whether we should delegate to ReflectionKickoff (which auto-POSTs).
  // "Fresh" = within the 7-day idempotency window AND generator_version
  // matches the current code — a bumped generator_version is a re-compute
  // signal (symmetric read-side guard per Playbook §16.17).
  const latest = latestReflectionRes.data;
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

      {threads.length > 0 && (
        <div className="mt-4">
          <span className="inline-block rounded-pill bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-white">
            Open conversations
          </span>
          <ul className="mt-2.5 divide-y divide-hair rounded-card-xs bg-surface px-4 shadow-soft">
            {threads.map((thread) => {
              const personName = thread.person_id
                ? (personMap.get(thread.person_id) ?? "Someone")
                : "General";
              return (
                <li key={thread.thread_id}>
                  <Link
                    href={`/coach/threads/${thread.thread_id}`}
                    className="flex min-h-11 items-center gap-3 py-3 active:opacity-70"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                      {personName}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-ink-muted capitalize">
                      {thread.status === "stabilizing" ? "stabilizing" : "open"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
