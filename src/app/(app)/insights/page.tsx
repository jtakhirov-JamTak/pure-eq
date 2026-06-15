// Pure EQ domain — replace in fork.
//
// /insights renders:
//   1. Weekly reflection — 20 coins. A fresh row (7-day window) renders
//      directly (free); otherwise ReflectionKickoff shows the explicit
//      "Generate · N coins" button, or the locked entries-gate card.
//   2. Monthly Report (B4) — 80 coins. Same shape: fresh row (28-day window;
//      refusal rows only 7 days) renders free; otherwise MonthlyReportKickoff
//      or the locked "N of 10 this month" card.
//
// Cost-wise, loading this page repeatedly inside the windows is free:
// viewing cached rows never calls Claude or charges coins. Only an explicit
// tap on a Generate button (on cache miss) spends coins.
import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ReflectionCard } from "@/components/insights/ReflectionCard";
import { ReflectionKickoff } from "@/components/insights/ReflectionKickoff";
import { MonthlyReportCard } from "@/components/insights/MonthlyReportCard";
import { MonthlyReportKickoff } from "@/components/insights/MonthlyReportKickoff";
import {
  InsightsSection,
  type InsightsHistoryItem,
} from "@/components/insights/InsightsSection";
import { StormBackground } from "@/components/brand/StormBackground";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import { pillAccentClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COIN_COSTS } from "@/types";
import {
  GENERATOR_VERSION,
  IDEMPOTENCY_WINDOW_MS,
  MIN_ENTRIES_FOR_REFLECTION,
  REFLECTION_GATE_RECORD_TYPES,
} from "@/lib/insights/generate";
import {
  REPORT_GENERATOR_VERSION,
  REPORT_IDEMPOTENCY_WINDOW_MS,
  REPORT_REFUSAL_WINDOW_MS,
  REPORT_INPUT_WINDOW_DAYS,
  MIN_ENTRIES_FOR_REPORT,
  REPORT_GATE_RECORD_TYPES,
} from "@/lib/insights/monthly-report";
import {
  isReportSnapshot,
  type ReportSnapshot,
} from "@/lib/insights/report-snapshot";
import {
  reflectionOutputSchema,
  monthlyReportOutputSchema,
} from "@/lib/ai/schemas";
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

  // Async Server Component renders once per request — current-time logic here
  // is genuine staleness math, not a render-loop impurity.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const reportWindowStart = new Date(
    nowMs - REPORT_INPUT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // How many past reports of each type the user can browse left/right. A small
  // cap: this is a personal look-back, not an archive, and the version guard
  // below already drops pre-redesign rows that would render broken. Kept low on
  // purpose — every card in the history is server-rendered and serialized into
  // the client payload (InsightsSection is a Client Component), and the page is
  // collapsed by default, so a large cap ships markup the user may never see.
  // Upgrade path if look-back depth ever needs to grow: fetch-older-on-expand
  // via a client request instead of pre-serializing the whole window.
  const HISTORY_LIMIT = 6;

  const [reflectionsRes, entryCountRes, reportsRes, reportCountRes] =
    await Promise.all([
      supabase
        .from("weekly_reflections")
        .select(
          "generated_at, generator_version, ai_json, period_start, period_end",
        )
        .eq("user_id", user.id)
        .order("generated_at", { ascending: false })
        .limit(HISTORY_LIMIT),
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
      supabase
        .from("monthly_reports")
        .select(
          "generated_at, generator_version, ai_json, server_json, period_start, period_end",
        )
        .eq("user_id", user.id)
        .order("generated_at", { ascending: false })
        .limit(HISTORY_LIMIT),
      // In-WINDOW count for the Monthly Report gate (last 28 days, broader
      // record-type set incl. the Tools). Server re-counts in
      // generateMonthlyReport; this drives the locked vs. generate UI state.
      supabase
        .from("raw_records")
        .select("raw_record_id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("record_type", [...REPORT_GATE_RECORD_TYPES])
        .eq("is_complete", true)
        .is("deleted_at", null)
        .gte("created_at", reportWindowStart),
    ]);

  if (reflectionsRes.error) {
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
  if (reportsRes.error) {
    captureServerRead(
      "insights",
      "monthly_reports_read",
      new Error("monthly_reports_read_failed"),
    );
  }
  if (reportCountRes.error) {
    captureServerRead(
      "insights",
      "report_entry_count_read",
      new Error("report_entry_count_read_failed"),
    );
  }

  // Gate the first reflection on a minimum number of reflective-module entries.
  // Fail OPEN on a count error (show the generate path) — the server re-counts
  // and is the authoritative gate, so a transient count failure shouldn't hide
  // the feature from an eligible user.
  const eligibleEntryCount = entryCountRes.count ?? 0;
  const canGenerate =
    !!entryCountRes.error || eligibleEntryCount >= MIN_ENTRIES_FOR_REFLECTION;

  // Build the browsable weekly history (newest first). Only rows whose
  // generator_version matches the current code AND whose ai_json still parses
  // are renderable — a bumped generator_version / pre-redesign row would render
  // broken (symmetric read-side guard per Playbook §16.17), so it's skipped.
  const weeklyRows = reflectionsRes.data ?? [];
  type WeeklyEntry = InsightsHistoryItem & {
    reflection: import("@/lib/ai/schemas").ReflectionOutput;
  };
  const weeklyHistory: WeeklyEntry[] = [];
  for (const row of weeklyRows) {
    if (row.generator_version !== GENERATOR_VERSION) continue;
    const parsed = reflectionOutputSchema.safeParse(row.ai_json);
    if (!parsed.success) continue;
    weeklyHistory.push({
      generatedAt: row.generated_at,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      reflection: parsed.data,
    });
  }

  // The latest RAW row drives the generate decision (independent of whether it
  // is renderable): "fresh" = within the 7-day window AND current version AND
  // parses. When fresh, the latest reflection is already browsable as item 0,
  // so no Generate CTA is shown; otherwise we offer Generate alongside history.
  const latest = weeklyRows[0] ?? null;
  let latestReflectionFresh = false;
  if (latest) {
    const ageMs = nowMs - new Date(latest.generated_at).getTime();
    const versionOk = latest.generator_version === GENERATOR_VERSION;
    const parsed = reflectionOutputSchema.safeParse(latest.ai_json);
    latestReflectionFresh =
      ageMs < IDEMPOTENCY_WINDOW_MS && versionOk && parsed.success;
  }
  const hasStaleCached = !!latest && !latestReflectionFresh;

  // Monthly Report: same fresh-vs-stale-vs-locked decision, 28-day window.
  // Gate fails OPEN on a count error (server re-counts and is authoritative).
  const reportEntryCount = reportCountRes.count ?? 0;
  const canGenerateReport =
    !!reportCountRes.error || reportEntryCount >= MIN_ENTRIES_FOR_REPORT;

  const reportRows = reportsRes.data ?? [];
  type ReportEntry = InsightsHistoryItem & {
    report: import("@/lib/ai/schemas").MonthlyReportOutput;
    snapshot: ReportSnapshot;
  };
  const reportHistory: ReportEntry[] = [];
  for (const row of reportRows) {
    if (row.generator_version !== REPORT_GENERATOR_VERSION) continue;
    const parsed = monthlyReportOutputSchema.safeParse(row.ai_json);
    if (!parsed.success) continue;
    if (!isReportSnapshot(row.server_json)) continue;
    reportHistory.push({
      generatedAt: row.generated_at,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      report: parsed.data,
      snapshot: row.server_json,
    });
  }

  const latestReport = reportRows[0] ?? null;
  let latestReportFresh = false;
  if (latestReport) {
    const ageMs = nowMs - new Date(latestReport.generated_at).getTime();
    const versionOk =
      latestReport.generator_version === REPORT_GENERATOR_VERSION;
    const parsed = monthlyReportOutputSchema.safeParse(latestReport.ai_json);
    // Mode-aware freshness, symmetric with readCachedReport: refusal rows
    // expire after a week (the copy says "try again in a week or two") so
    // the Generate button comes back; real reports hold the full 28 days.
    const windowMs =
      parsed.success && parsed.data.mode === "refusal"
        ? REPORT_REFUSAL_WINDOW_MS
        : REPORT_IDEMPOTENCY_WINDOW_MS;
    latestReportFresh =
      ageMs < windowMs &&
      versionOk &&
      parsed.success &&
      isReportSnapshot(latestReport.server_json);
  }
  const hasStaleReport = !!latestReport && !latestReportFresh;

  // ----- Section composition (collapsible + browse) -----

  // Weekly: show the Generate CTA unless the latest reflection is already fresh.
  // canGenerate is true for anyone who has reflected before, so the locked card
  // only appears for brand-new users with no history.
  const weeklyGenerateSlot = latestReflectionFresh ? null : canGenerate ? (
    <ReflectionKickoff hasStaleCached={hasStaleCached} hideHeader />
  ) : (
    <Card className="mt-4 p-5">
      <p className="text-[14px] font-medium leading-[1.55] text-ink-soft">
        Your first reflection unlocks after {MIN_ENTRIES_FOR_REFLECTION} Coach
        entries — enough to ground a read of your patterns in your own words.
        Keep using Prepare, Review, Repair, and Pulse Check.
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
  );

  const weeklyCollapsedHint =
    weeklyHistory.length > 0
      ? undefined
      : canGenerate
        ? `Tap to generate · ${COIN_COSTS.weekly_insights} coins`
        : `${eligibleEntryCount} of ${MIN_ENTRIES_FOR_REFLECTION} entries`;

  // Monthly: same shape. Locked CAN co-occur with history here (the gate is an
  // in-window count that can drop below threshold after a prior report).
  const monthlyGenerateSlot = latestReportFresh ? null : canGenerateReport ? (
    <MonthlyReportKickoff hasStaleCached={hasStaleReport} hideHeader />
  ) : (
    <Card className="mt-4 p-5">
      <p className="text-[14px] font-medium leading-[1.55] text-ink-soft">
        Your monthly report unlocks after {MIN_ENTRIES_FOR_REPORT} entries in
        the last {REPORT_INPUT_WINDOW_DAYS} days — a month of real usage to
        ground tendencies, patterns, and an EQ read.
      </p>
      <p className="mt-3 text-[13px] font-semibold text-ink">
        {reportEntryCount} of {MIN_ENTRIES_FOR_REPORT} entries this month
      </p>
    </Card>
  );

  const monthlyCollapsedHint =
    reportHistory.length > 0
      ? undefined
      : canGenerateReport
        ? `Tap to generate · ${COIN_COSTS.monthly_report} coins`
        : `${reportEntryCount} of ${MIN_ENTRIES_FOR_REPORT} entries this month`;

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

      {/* Weekly reflection — collapsible (collapsed by default). The header
          shows the active item's period + generated date; expanding reveals the
          Generate CTA (when due) and a ‹ Older / Newer › browser over past
          reflections. */}
      <InsightsSection
        title="Your weekly reflection"
        noun="reflection"
        entries={weeklyHistory.map((h, i) => ({
          item: h,
          card: (
            <ReflectionCard
              key={i}
              reflection={h.reflection}
              generatedAt={h.generatedAt}
              hideHeader
            />
          ),
        }))}
        generateSlot={weeklyGenerateSlot}
        generateAvailable={!latestReflectionFresh && canGenerate}
        collapsedHint={weeklyCollapsedHint}
      />

      {/* Monthly Report (B4) — same collapsible + browse shape, 80 coins. */}
      <InsightsSection
        title="Your monthly report"
        noun="report"
        entries={reportHistory.map((h, i) => ({
          item: h,
          card: (
            <MonthlyReportCard
              key={i}
              report={h.report}
              snapshot={h.snapshot}
              generatedAt={h.generatedAt}
              hideHeader
            />
          ),
        }))}
        generateSlot={monthlyGenerateSlot}
        generateAvailable={!latestReportFresh && canGenerateReport}
        collapsedHint={monthlyCollapsedHint}
      />
    </div>
  );
}
