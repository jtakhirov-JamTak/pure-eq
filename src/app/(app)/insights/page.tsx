// Pure EQ domain — replace in fork.
//
// /insights renders:
//   1. StyleBox — profile from the 9-question quiz
//   2. Weekly reflection — costs coins (Slice B3). When a fresh row exists in
//      the 7-day window it renders directly (free); otherwise ReflectionKickoff
//      shows an explicit "Generate · N coins" button that POSTs on tap.
//   3. Open conversations — list of active threads, if any exist.
//
// Cost-wise, loading this page repeatedly inside a 7-day window is free:
// viewing a cached reflection never calls Claude or charges coins. Only an
// explicit tap on the Generate button (on cache miss) spends coins.
import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ReflectionCard } from "@/components/insights/ReflectionCard";
import { ReflectionKickoff } from "@/components/insights/ReflectionKickoff";
import { StormBackground } from "@/components/brand/StormBackground";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import { pillAccentClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GENERATOR_VERSION,
  IDEMPOTENCY_WINDOW_MS,
  MIN_ENTRIES_FOR_REFLECTION,
  REFLECTION_GATE_RECORD_TYPES,
} from "@/lib/insights/generate";
import { reflectionOutputSchema } from "@/lib/ai/schemas";
import { captureServerRead } from "@/lib/read-capture";

export default async function InsightsPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Slice B3: Insights is no longer subscription-gated — any logged-in user can
  // open it. Generating a weekly reflection costs coins (charged on tap inside
  // ReflectionKickoff → /api/insights/generate); viewing an already-generated
  // reflection inside the 7-day window is free.

  const [latestReflectionRes, entryCountRes] = await Promise.all([
    supabase
      .from("weekly_reflections")
      .select("generated_at, generator_version, ai_json")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // All-time count of completed entries across the four reflective modules —
    // the gate for the first weekly reflection. head:true = COUNT only, no rows.
    // The server re-counts in generateReflection (the real gate); this drives
    // the locked vs. generate UI state.
    supabase
      .from("raw_records")
      .select("raw_record_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("record_type", [...REFLECTION_GATE_RECORD_TYPES])
      .eq("is_complete", true)
      .is("deleted_at", null),
  ]);

  if (latestReflectionRes.error) {
    captureServerRead(
      "insights",
      "weekly_reflections_read",
      new Error("weekly_reflections_read_failed"),
    );
  }
  if (entryCountRes.error) {
    captureServerRead(
      "insights",
      "entry_count_read",
      new Error("entry_count_read_failed"),
    );
  }

  // Gate the first reflection on a minimum number of reflective-module entries.
  // Fail OPEN on a count error (show the generate path) — the server re-counts
  // and is the authoritative gate, so a transient count failure shouldn't hide
  // the feature from an eligible user.
  const eligibleEntryCount = entryCountRes.count ?? 0;
  const canGenerate =
    !!entryCountRes.error || eligibleEntryCount >= MIN_ENTRIES_FOR_REFLECTION;

  // Decide whether the server-side row is fresh enough to render directly,
  // or whether we should delegate to ReflectionKickoff (which shows the
  // explicit "Generate · N coins" button on cache miss).
  // "Fresh" = within the 7-day idempotency window AND generator_version
  // matches the current code — a bumped generator_version is a re-compute
  // signal (symmetric read-side guard per Playbook §16.17).
  const latest = latestReflectionRes.data;
  let freshReflection:
    | { generatedAt: string; reflection: import("@/lib/ai/schemas").ReflectionOutput }
    | null = null;
  let hasStaleCached = false;

  if (latest) {
    // Async Server Component renders once per request — Date.now() here is
    // genuine current-time logic (reflection staleness), not a client
    // render-loop impurity the rule targets.
    // eslint-disable-next-line react-hooks/purity
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
      <StormBackground />

      <div className="pt-2">
        <Kicker className="text-accent-ink">Insights</Kicker>
        <h1
          className="mt-2.5 font-display text-[32px] font-medium leading-[1.08] text-ink"
          style={{ letterSpacing: "-1px" }}
        >
          Your <span className="italic">patterns</span> are who you are.
        </h1>
      </div>

      {freshReflection ? (
        <ReflectionCard
          reflection={freshReflection.reflection}
          generatedAt={freshReflection.generatedAt}
        />
      ) : canGenerate ? (
        <ReflectionKickoff hasStaleCached={hasStaleCached} />
      ) : (
        <Card className="mt-4 p-5">
          <Kicker as="h2">Your weekly reflection</Kicker>
          <p className="mt-2 text-[14px] font-medium leading-[1.55] text-ink-soft">
            Your first reflection unlocks after{" "}
            {MIN_ENTRIES_FOR_REFLECTION} Coach entries — enough to ground a read
            of your patterns in your own words. Keep using Prepare, Review,
            Repair, and Pulse Check.
          </p>
          <p className="mt-3 text-[13px] font-semibold text-ink">
            {eligibleEntryCount} of {MIN_ENTRIES_FOR_REFLECTION} entries
          </p>
          <Link
            href="/coach"
            className={cn(pillAccentClass, "mt-4 inline-flex h-11 px-5 text-[14px]")}
          >
            Go to Coach
          </Link>
        </Card>
      )}
    </div>
  );
}
