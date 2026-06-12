// Monthly Report orchestrator (B4, 2026-06-12).
//
// Reads the user's last ~28 days of entries plus this month's weekly
// reflections, calls Claude Opus 4.7 to produce the month-level report
// (tendencies per relationship context, regulation patterns, focus trend,
// top patterns, key person, EQ ratings), verifies every quoted claim
// server-side, and persists to `monthly_reports` alongside a server-computed
// snapshot (4-week heatmap, focus history, ranked top patterns).
//
// Mirrors src/lib/insights/generate.ts deliberately — same model scope
// (Opus stays Insights-only), same coin-charge callback shape (memory
// `project_coin_charge_dual_shape` — keep the refund symmetry), same
// fail-loudly INSERT, same cache-as-primary-cost-gate. Where the two
// diverge it's because the report has server-computed sections the weekly
// doesn't (server_json) and a tone schedule keyed off report_index.
//
// SERVER-AUTHORITATIVE PIECES (the model only narrates):
//   - heatmap grid + byType totals (computed from raw rows)
//   - focus history + acted-on grading (real entry counts)
//   - top-pattern ranking + confidence labels (from the weeklies' own
//     server-derived confidence)
//   - tendency/regulation evidence (substring-verified, type/context-checked)
//   - key person must come from the server's signal table
//   - EQ scores are model-judged but schema-clamped ints 1–10; the tone
//     schedule (first/gentle/realistic) modulates FRAMING only.

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  buildMonthlyReportPrompt,
  promptDataLine,
  type ReportFocusHistoryItem,
  type ReportPersonSignal,
  type ReportTone,
} from "@/lib/ai/prompts";
import { captureServerRead } from "@/lib/read-capture";
import {
  monthlyReportOutputSchema,
  reflectionOutputSchema,
  validateAIOutput,
  type MonthlyReportOutput,
  type MonthlyReportNormal,
  type ReportTendencyContext,
  type ReflectionFocus,
  type FocusFollowup,
} from "@/lib/ai/schemas";
import { isAIDisabled } from "@/lib/kill-switch";
import { recordEvent } from "@/lib/observability";
import { buildReflectionInput } from "./reflection-input";
import {
  buildEntryLookup,
  quoteVerifies,
  computeFocusActivity,
} from "./generate";
import {
  bucketFor,
  BUCKET_PRIORITY,
  type ActivityBucket,
  type DayCell,
} from "@/lib/coach/activity-types";
import {
  isReportSnapshot,
  MIN_ENTRIES_FOR_REPORT,
  REPORT_GRID_WEEKS,
  type ReportSnapshot,
} from "./report-snapshot";
import { COIN_COSTS, type ProfileType, type RelationshipDomain } from "@/types";

// Re-export the snapshot surface so server-side consumers can keep importing
// from this module; client components import from ./report-snapshot directly.
export {
  isReportSnapshot,
  MIN_ENTRIES_FOR_REPORT,
  REPORT_GRID_WEEKS,
  type ReportSnapshot,
};

// v1 (2026-06-12): initial shape. Bump on ANY change to ai_json or
// server_json shape — the reader gates on exact match and falls through to
// the Generate button (symmetric guard, Playbook §16.17).
export const REPORT_GENERATOR_VERSION = "monthly_report_v1";

export const REPORT_IDEMPOTENCY_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;
// A REFUSAL row caches for one week, not the full 28 days: refusals refund,
// the user is told "try again in a week or two", and they're presumably
// adding entries — locking them out of a purchasable report for a month over
// a thin-data check contradicts the copy AND the business interest. Real
// reports keep the full window. The page reader applies the SAME mode-aware
// window (symmetric guard).
export const REPORT_REFUSAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const REPORT_INPUT_WINDOW_DAYS = 28;
const REPORT_INPUT_WINDOW_MS = REPORT_INPUT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Grading floor for the LIVE-graded latest focus: a focus younger than this
// with zero activity is "too recent to grade" (null), not "not acted on" —
// the weekly cadence gives every focus a full week before it's judged.
// Any real activity grades it acted-on immediately regardless of age.
export const FOCUS_GRADING_MIN_AGE_MS = 6 * 24 * 60 * 60 * 1000;
export const REPORT_GATE_RECORD_TYPES = [
  "prepare",
  "review",
  "repair",
  "pulse_check",
  "trigger_log",
  "overwhelmed",
] as const;

// A tendency context is offered to the model only when this many entries
// involve persons in that context this month.
export const MIN_CONTEXT_ENTRIES = 2;
// Regulation patterns need this many tool entries of the matching type.
export const MIN_REGULATION_ENTRIES = 2;
// Persons enter the key-person signal table at this many window entries.
export const MIN_PERSON_ENTRIES = 2;

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 2500;
const ANTHROPIC_TIMEOUT_MS = 50_000;

// Same work roll-up as the Convos stats dashboard (GROUP_LABELS in
// conversation-stats.ts) — kept local so this module never imports the
// request-scoped server client and stays unit-testable.
const DOMAIN_TO_CONTEXT: Record<RelationshipDomain, ReportTendencyContext> = {
  partner: "partner",
  friend: "friend",
  family: "family",
  manager: "work",
  direct_report: "work",
  coworker: "work",
  client: "work",
  other: "other",
};

export class ReportGenerationError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "no_text"
      | "json_parse"
      | "schema_mismatch"
      | "banned_phrase"
      | "api_error"
      | "insert_failed"
      | "db_read_failed"
      | "coin_charge_failed",
  ) {
    super(message);
    this.name = "ReportGenerationError";
  }
}

type MonthlyReportDbRow = Database["public"]["Tables"]["monthly_reports"]["Row"];
type MonthlyReportDbInsert =
  Database["public"]["Tables"]["monthly_reports"]["Insert"];

export type MonthlyReportRow = Omit<
  MonthlyReportDbRow,
  "ai_json" | "server_json"
> & {
  ai_json: MonthlyReportOutput;
  server_json: ReportSnapshot;
};

type MonthlyReportInsert = Omit<
  MonthlyReportDbInsert,
  "ai_json" | "server_json"
> & {
  ai_json: MonthlyReportOutput;
  server_json: ReportSnapshot;
};

type GenerateOutcome =
  | { status: "cached"; row: MonthlyReportRow }
  | { status: "created"; row: MonthlyReportRow }
  | { status: "ai_disabled" }
  | { status: "profile_missing" }
  | { status: "insufficient_entries"; count: number; needed: number }
  | { status: "insufficient_coins"; balance: number; needed: number };

export interface GenerateReportOptions {
  // Same contract as GenerateOptions in generate.ts — see that file's docs.
  // Keep the two refund policies symmetric (memory project_coin_charge_dual_shape).
  reserveCoins?: () => Promise<
    | { result: "charged"; fresh: boolean }
    | { result: "insufficient"; balance: number; needed: number }
    | { result: "error" }
  >;
  onChargedGenerationFailed?: () => Promise<void>;
}

// ============================================================
// Pure helpers (exported for unit tests)
// ============================================================

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Monday of the oldest week in the report grid. Exported so the orchestrator
 * can window the legend's byType/total to EXACTLY the days the grid shows —
 * counting the full rolling 28 days while the Monday-aligned grid shows
 * 22–28 of them would make the legend disagree with the visible cells.
 */
export function reportGridStart(now: Date): Date {
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const thisMonday = startOfDay(now);
  thisMonday.setDate(thisMonday.getDate() - daysSinceMonday);
  const gridStart = new Date(thisMonday);
  gridStart.setDate(thisMonday.getDate() - (REPORT_GRID_WEEKS - 1) * 7);
  return gridStart;
}

/**
 * Build the 4-week heatmap snapshot from window rows. Pure — mirrors
 * activity-stats buildGrid (Mon..Sun rows × week columns, dominant bucket by
 * the shared BUCKET_PRIORITY tie-break) but parameterized on `now` and fixed
 * at REPORT_GRID_WEEKS so the report's grid is reproducible in tests.
 */
export function buildReportGrid(
  items: Array<{ createdAt: string; bucket: ActivityBucket }>,
  now: Date,
): DayCell[][] {
  const priority = BUCKET_PRIORITY;
  const gridStart = reportGridStart(now);

  const byDay = new Map<number, Record<ActivityBucket, number>>();
  for (const item of items) {
    const dayKey = startOfDay(new Date(item.createdAt)).getTime();
    const counts =
      byDay.get(dayKey) ??
      { conversations: 0, pulse: 0, regulation: 0, beforeSend: 0 };
    counts[item.bucket] += 1;
    byDay.set(dayKey, counts);
  }

  const weeks: DayCell[][] = [];
  for (let w = 0; w < REPORT_GRID_WEEKS; w++) {
    const col: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + w * 7 + d,
      );
      const counts = byDay.get(day.getTime());
      let dominant: ActivityBucket | null = null;
      let total = 0;
      if (counts) {
        for (const b of priority) {
          total += counts[b];
          if (counts[b] > (dominant ? counts[dominant] : 0)) dominant = b;
        }
      }
      col.push({ date: day.toISOString(), dominant, total });
    }
    weeks.push(col);
  }
  return weeks;
}

/**
 * Rank this month's weekly-reflection observations into top-pattern
 * candidates: dedupe by exact theme keeping the strongest confidence, then
 * sort by confidence weight (clear > emerging > early) with later
 * observations winning ties (most recent read of the user). Confidence here
 * was server-derived when each weekly was generated — never the model's.
 */
export function rankTopPatterns(
  observations: Array<{
    theme: string;
    confidence: "early" | "emerging" | "clear";
  }>,
  limit = 3,
): Array<{ theme: string; confidence: "early" | "emerging" | "clear" }> {
  const weight = { early: 1, emerging: 2, clear: 3 } as const;
  const byTheme = new Map<
    string,
    { theme: string; confidence: "early" | "emerging" | "clear"; order: number }
  >();
  observations.forEach((obs, i) => {
    const key = obs.theme.trim();
    if (!key) return;
    const existing = byTheme.get(key);
    if (!existing || weight[obs.confidence] >= weight[existing.confidence]) {
      byTheme.set(key, { theme: key, confidence: obs.confidence, order: i });
    }
  });
  return [...byTheme.values()]
    .sort((a, b) =>
      weight[b.confidence] !== weight[a.confidence]
        ? weight[b.confidence] - weight[a.confidence]
        : b.order - a.order,
    )
    .slice(0, limit)
    .map(({ theme, confidence }) => ({ theme, confidence }));
}

/**
 * Map the report tone from the 0-based report index. Founder schedule:
 * first report fully realistic (sets the baseline), second one gently
 * FRAMED (scores stay honest), realistic from the third on.
 */
export function toneForReportIndex(index: number): ReportTone {
  if (index === 0) return "first";
  if (index === 1) return "gentle";
  return "realistic";
}

/**
 * Grade the latest (successor-less) focus from live activity counts:
 *   any activity        → acted on (credit early engagement immediately)
 *   none + under a week → null ("too recent to grade" — the weekly cadence
 *                         gives every focus a full week before judgment)
 *   none + a week old   → not acted on
 * Without the age floor, generating a report minutes after a weekly
 * reflection would brand the brand-new focus "not acted on" in the card AND
 * in the prompt's focus block. Exported for unit tests.
 */
export function gradeUngradedFocus(
  activityTotal: number,
  setAtIso: string,
  nowMs: number,
): boolean | null {
  if (activityTotal >= 1) return true;
  const ageMs = nowMs - new Date(setAtIso).getTime();
  return ageMs < FOCUS_GRADING_MIN_AGE_MS ? null : false;
}

type EntryMeta = {
  recordType: string;
  context: ReportTendencyContext | null;
};

/**
 * Server-side verification pass over the model's report. Drops anything that
 * can't be proven:
 *   - tendency: context must be allowed, every quote must substring-verify
 *     AND cite an entry whose person maps to that same context.
 *   - trigger/overwhelm pattern: every quote must verify AND cite an entry of
 *     the matching record_type; the type must have cleared its entry minimum.
 *   - top_patterns: theme must verbatim-match a server candidate.
 *   - key_person: name must match a person in the signal table.
 *   - focus_trend: forced null when the month had no focus history.
 * Exported for unit tests.
 */
export function verifyReport(
  report: MonthlyReportNormal,
  entryLookup: Map<string, string>,
  entryMeta: Map<string, EntryMeta>,
  allowed: {
    contexts: ReportTendencyContext[];
    triggerOk: boolean;
    overwhelmOk: boolean;
    candidateThemes: string[];
    personNames: string[];
    hasFocusHistory: boolean;
  },
): MonthlyReportNormal {
  const contextSet = new Set(allowed.contexts);
  const themeSet = new Set(allowed.candidateThemes.map((t) => t.trim()));
  const nameSet = new Set(allowed.personNames.map((n) => n.trim()));

  const tendencies = report.tendencies.filter(
    (t) =>
      contextSet.has(t.context) &&
      t.evidence.every(
        (ev) =>
          quoteVerifies(ev, entryLookup) &&
          entryMeta.get(ev.source_record_id)?.context === t.context,
      ),
  );

  const verifyRegulation = (
    pattern: MonthlyReportNormal["trigger_pattern"],
    recordType: string,
    typeOk: boolean,
  ) =>
    pattern &&
    typeOk &&
    pattern.evidence.every(
      (ev) =>
        quoteVerifies(ev, entryLookup) &&
        entryMeta.get(ev.source_record_id)?.recordType === recordType,
    )
      ? pattern
      : null;

  return {
    ...report,
    tendencies,
    trigger_pattern: verifyRegulation(
      report.trigger_pattern,
      "trigger_log",
      allowed.triggerOk,
    ),
    overwhelm_pattern: verifyRegulation(
      report.overwhelm_pattern,
      "overwhelmed",
      allowed.overwhelmOk,
    ),
    top_patterns: report.top_patterns.filter((p) =>
      themeSet.has(p.theme.trim()),
    ),
    key_person:
      report.key_person && nameSet.has(report.key_person.name.trim())
        ? report.key_person
        : null,
    focus_trend: allowed.hasFocusHistory ? report.focus_trend : null,
  };
}

/**
 * A verified report is sellable only if at least one grounded section
 * survived — EQ ratings alone (model judgment with no verified evidence
 * sections) is not worth 80 coins. Exported for unit tests.
 */
export function reportIsViable(report: MonthlyReportNormal): boolean {
  return (
    report.tendencies.length > 0 ||
    report.top_patterns.length > 0 ||
    report.trigger_pattern !== null ||
    report.overwhelm_pattern !== null
  );
}

// ============================================================
// DB reads
// ============================================================

async function readCachedReport(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MonthlyReportRow | null> {
  const cutoff = new Date(Date.now() - REPORT_IDEMPOTENCY_WINDOW_MS).toISOString();
  const latest = await supabase
    .from("monthly_reports")
    .select("*")
    .eq("user_id", userId)
    .eq("generator_version", REPORT_GENERATOR_VERSION)
    .gte("generated_at", cutoff)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error) {
    throw new ReportGenerationError(
      `monthly_reports lookup failed: ${latest.error.message}`,
      "db_read_failed",
    );
  }
  if (!latest.data) return null;

  const aiParse = monthlyReportOutputSchema.safeParse(latest.data.ai_json);
  if (!aiParse.success) return null; // legacy/hand-edited shape → regen
  if (!isReportSnapshot(latest.data.server_json)) return null;

  // Refusal rows expire after a week (REPORT_REFUSAL_WINDOW_MS) so a user
  // who keeps adding entries can retry — the refusal copy promises exactly
  // that. Real reports hold the full 28-day window.
  if (
    aiParse.data.mode === "refusal" &&
    Date.now() - new Date(latest.data.generated_at).getTime() >=
      REPORT_REFUSAL_WINDOW_MS
  ) {
    return null;
  }

  return {
    ...latest.data,
    ai_json: aiParse.data,
    server_json: latest.data.server_json,
  };
}

/** Completed in-window entries across the report's record types. */
export async function countReportEligibleEntries(
  supabase: SupabaseClient<Database>,
  userId: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("raw_records")
    .select("raw_record_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("record_type", [...REPORT_GATE_RECORD_TYPES])
    .eq("is_complete", true)
    .is("deleted_at", null)
    .gte("created_at", sinceIso);
  if (error) {
    throw new ReportGenerationError(
      `raw_records count failed: ${error.message}`,
      "db_read_failed",
    );
  }
  return count ?? 0;
}

// ============================================================
// Orchestrator
// ============================================================

/**
 * Generate (or return cached) Monthly Report for a user.
 *
 * `supabase` MUST be a service-role client (the INSERT bypasses RLS — no
 * INSERT policy on monthly_reports). Caller must have already authed the user.
 */
export async function generateMonthlyReport(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: GenerateReportOptions = {},
): Promise<GenerateOutcome> {
  // Idempotency short-circuit — the PRIMARY cost gate (one Opus call per
  // 28-day window, no matter how many times the endpoint is hit).
  const cachedRow = await readCachedReport(supabase, userId);
  if (cachedRow) {
    return { status: "cached", row: cachedRow };
  }

  if (isAIDisabled()) {
    return { status: "ai_disabled" };
  }

  const periodStartMs = Date.now() - REPORT_INPUT_WINDOW_MS;
  const periodStart = new Date(periodStartMs).toISOString();
  const periodEnd = new Date().toISOString();

  // Entry-count gate BEFORE the profile read + coin reserve — a user below
  // the bar is never charged.
  const eligibleEntries = await countReportEligibleEntries(
    supabase,
    userId,
    periodStart,
  );
  if (eligibleEntries < MIN_ENTRIES_FOR_REPORT) {
    return {
      status: "insufficient_entries",
      count: eligibleEntries,
      needed: MIN_ENTRIES_FOR_REPORT,
    };
  }

  const profileRes = await supabase
    .from("user_profiles")
    .select("primary_profile")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileRes.error) {
    throw new ReportGenerationError(
      `user_profiles lookup failed: ${profileRes.error.message}`,
      "db_read_failed",
    );
  }
  if (!profileRes.data) {
    return { status: "profile_missing" };
  }
  const profile = profileRes.data.primary_profile as ProfileType;

  // Parallel reads. persons/entries are load-bearing (throw on error);
  // BYS timestamps, threads, weeklies, and the report count are
  // supplementary — on error we degrade that section rather than fail the
  // report (each captured below if it ever matters; here the failure mode is
  // an emptier report, which the viability gate still protects).
  const [personsRes, entriesRes, bysRes, threadsRes, weekliesRes, priorCountRes] =
    await Promise.all([
      supabase
        .from("persons")
        .select("person_id, display_name, relationship_domain")
        .eq("user_id", userId)
        .eq("is_active", true)
        .limit(100),
      supabase
        .from("raw_records")
        .select("raw_record_id, record_type, created_at, person_id, payload_json")
        .eq("user_id", userId)
        .in("record_type", [...REPORT_GATE_RECORD_TYPES])
        .eq("is_complete", true)
        .is("deleted_at", null)
        .gte("created_at", periodStart)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("before_you_send_entries")
        .select("created_at")
        .eq("user_id", userId)
        .eq("is_complete", true)
        .is("deleted_at", null)
        .gte("created_at", periodStart)
        .limit(200),
      supabase
        .from("conversation_threads")
        .select("person_id, status, last_activity_at")
        .eq("user_id", userId)
        .gte("last_activity_at", periodStart)
        .limit(500),
      supabase
        .from("weekly_reflections")
        .select("generated_at, ai_json")
        .eq("user_id", userId)
        .gte("generated_at", periodStart)
        .order("generated_at", { ascending: true })
        .limit(10),
      // Tone-schedule index counts REAL reports only — a refunded refusal
      // month must not consume the "first/baseline" slot (the user has never
      // actually seen a report). jsonb path filter; mode is Zod-validated
      // before every INSERT.
      supabase
        .from("monthly_reports")
        .select("report_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("ai_json->>mode", "report"),
    ]);

  if (personsRes.error) {
    throw new ReportGenerationError(
      `persons lookup failed: ${personsRes.error.message}`,
      "db_read_failed",
    );
  }
  if (entriesRes.error) {
    throw new ReportGenerationError(
      `raw_records lookup failed: ${entriesRes.error.message}`,
      "db_read_failed",
    );
  }
  if (priorCountRes.error) {
    // report_index drives the unique row + tone — a wrong index could
    // collide or mis-tone; fail closed rather than guess.
    throw new ReportGenerationError(
      `monthly_reports count failed: ${priorCountRes.error.message}`,
      "db_read_failed",
    );
  }
  // Cooldown-latched via captureServerRead (per-area:kind 5-min latch) —
  // these supplementary reads degrade the report rather than fail it, and an
  // outage must not emit one event per request (CLAUDE.md latch rule).
  for (const [res, kind] of [
    [bysRes, "bys_window_read"],
    [threadsRes, "threads_window_read"],
    [weekliesRes, "weeklies_window_read"],
  ] as const) {
    if (res.error) {
      captureServerRead("monthly_report", kind, new Error(`${kind}_failed`));
    }
  }

  const rawRecords = entriesRes.data ?? [];
  const persons = personsRes.data ?? [];
  const reportIndex = priorCountRes.count ?? 0;
  const tone = toneForReportIndex(reportIndex);

  // Person → context map + per-entry metadata for verification.
  const personById = new Map(
    persons.map((p) => [
      p.person_id,
      {
        name: p.display_name,
        context:
          DOMAIN_TO_CONTEXT[p.relationship_domain as RelationshipDomain] ??
          ("other" as const),
      },
    ]),
  );
  const entryMeta = new Map<string, EntryMeta>();
  for (const r of rawRecords) {
    entryMeta.set(r.raw_record_id, {
      recordType: r.record_type,
      // Entries by a person we can't resolve (deactivated since) get NO
      // context — falling back to "other" would let their quotes pass the
      // context check for "other" tendencies while the person is excluded
      // from contextCounts (asymmetric).
      context: r.person_id
        ? (personById.get(r.person_id)?.context ?? null)
        : null,
    });
  }

  // Domain coverage: which contexts have enough person-linked CONVERSATION
  // entries to support a tendency. Regulation tools count separately.
  const conversationTypes = new Set(["prepare", "review", "repair", "pulse_check"]);
  const contextCounts = new Map<ReportTendencyContext, number>();
  const personEntryCounts = new Map<string, number>();
  let triggerCount = 0;
  let overwhelmCount = 0;
  for (const r of rawRecords) {
    if (r.record_type === "trigger_log") triggerCount += 1;
    if (r.record_type === "overwhelmed") overwhelmCount += 1;
    if (r.person_id) {
      personEntryCounts.set(
        r.person_id,
        (personEntryCounts.get(r.person_id) ?? 0) + 1,
      );
      if (conversationTypes.has(r.record_type)) {
        const ctx = personById.get(r.person_id)?.context;
        if (ctx) contextCounts.set(ctx, (contextCounts.get(ctx) ?? 0) + 1);
      }
    }
  }
  const allowedContexts = [...contextCounts.entries()]
    .filter(([, n]) => n >= MIN_CONTEXT_ENTRIES)
    .map(([ctx]) => ctx);
  const triggerOk = triggerCount >= MIN_REGULATION_ENTRIES;
  const overwhelmOk = overwhelmCount >= MIN_REGULATION_ENTRIES;

  // Person signals for the key-person pick: window entry volume + live
  // threads (current status, window-active). "Open" counts open +
  // in_progress — the 3-state collapse (migration 0050) removed worsened.
  const threadCounts = new Map<string, { open: number }>();
  for (const t of threadsRes.data ?? []) {
    if (!t.person_id) continue;
    const c = threadCounts.get(t.person_id) ?? { open: 0 };
    if (t.status === "open" || t.status === "in_progress") c.open += 1;
    threadCounts.set(t.person_id, c);
  }
  const personSignals: ReportPersonSignal[] = [...personEntryCounts.entries()]
    .filter(([, n]) => n >= MIN_PERSON_ENTRIES)
    .map(([personId, entryCount]): ReportPersonSignal | null => {
      const p = personById.get(personId);
      const t = threadCounts.get(personId) ?? { open: 0 };
      // Name sanitized at the SOURCE (not just at prompt interpolation):
      // the model copies it verbatim and verifyReport matches it against
      // this same value — sanitizing only one side would break the match.
      return p
        ? {
            name: promptDataLine(p.name),
            domain: p.context,
            entryCount,
            openThreads: t.open,
          }
        : null;
    })
    .filter((s): s is ReportPersonSignal => s !== null)
    .sort((a, b) => b.entryCount - a.entryCount)
    .slice(0, 8);

  // Focus history from this month's weekly reflections (current-shape rows
  // only — older generator versions fail the parse and just don't count).
  // Grading: a focus is graded by the NEXT reflection's focus_followup when
  // its prior_theme matches; the latest focus (no successor) is graded LIVE
  // from real tool entries via computeFocusActivity.
  const weeklyRows = (weekliesRes.data ?? [])
    .map((row) => {
      const parsed = reflectionOutputSchema.safeParse(row.ai_json);
      return parsed.success && parsed.data.mode === "reflection"
        ? { generatedAt: row.generated_at, reflection: parsed.data }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const focusHistory: ReportFocusHistoryItem[] = [];
  for (let i = 0; i < weeklyRows.length; i++) {
    const { generatedAt, reflection } = weeklyRows[i];
    const focus: ReflectionFocus = reflection.focus;
    let tookAction: boolean | null = null;
    const next = weeklyRows[i + 1];
    const nextFollowup: FocusFollowup | null = next
      ? next.reflection.focus_followup
      : null;
    if (nextFollowup && nextFollowup.prior_theme.trim() === focus.theme.trim()) {
      tookAction = nextFollowup.took_action;
    } else if (!next) {
      const activity = await computeFocusActivity(
        supabase,
        userId,
        focus.modules,
        generatedAt,
      );
      tookAction = gradeUngradedFocus(
        activity.activityTotal,
        generatedAt,
        Date.now(),
      );
    }
    focusHistory.push({
      theme: focus.theme,
      setOn: generatedAt.slice(0, 10),
      tookAction,
    });
  }

  // Top-pattern candidates: server-ranked from the weeklies' observations.
  // Themes sanitized at the source (same reason as signal names above).
  const topPatternCandidates = rankTopPatterns(
    weeklyRows.flatMap((w) =>
      w.reflection.observations.map((o) => ({
        theme: promptDataLine(o.theme),
        confidence: o.confidence,
      })),
    ),
  );

  // Structured entries block (same builder + caps as the weekly).
  const input = buildReflectionInput(
    rawRecords.map((r) => ({
      raw_record_id: r.raw_record_id,
      record_type: r.record_type,
      created_at: r.created_at ?? periodEnd,
      person_id: r.person_id,
      payload_json: r.payload_json,
    })),
    persons.map((p) => ({
      person_id: p.person_id,
      display_name: p.display_name,
      relationship_domain: p.relationship_domain,
    })),
  );

  const prompt = buildMonthlyReportPrompt({
    profile,
    persons: input.persons,
    entries: input.entries,
    allowedContexts,
    triggerCount,
    overwhelmCount,
    focusHistory,
    topPatternCandidates,
    personSignals,
    tone,
    windowDays: REPORT_INPUT_WINDOW_DAYS,
  });

  // Server snapshot — computed regardless of what the model returns.
  // byType/total are windowed to the GRID's Monday-aligned span (22–28 days),
  // not the full rolling 28-day input window, so the legend always agrees
  // with the visible cells. (Reads are capped at 100/200 rows — at >3 entries
  // per day for a month the counts undercount; acceptable for v0, the grid
  // saturates visually long before that.)
  const snapshotNow = new Date();
  const gridStartMs = reportGridStart(snapshotNow).getTime();
  const heatmapItems: Array<{ createdAt: string; bucket: ActivityBucket }> = [];
  const byType: Record<ActivityBucket, number> = {
    conversations: 0,
    pulse: 0,
    regulation: 0,
    beforeSend: 0,
  };
  const addItem = (createdAt: string, bucket: ActivityBucket) => {
    heatmapItems.push({ createdAt, bucket });
    if (new Date(createdAt).getTime() >= gridStartMs) byType[bucket] += 1;
  };
  for (const r of rawRecords) {
    const bucket = bucketFor(r.record_type);
    if (!bucket || !r.created_at) continue;
    addItem(r.created_at, bucket);
  }
  for (const b of bysRes.data ?? []) {
    addItem(b.created_at, "beforeSend");
  }
  const serverSnapshot: ReportSnapshot = {
    grid: buildReportGrid(heatmapItems, snapshotNow),
    byType,
    total:
      byType.conversations + byType.pulse + byType.regulation + byType.beforeSend,
    focusHistory,
    topPatterns: topPatternCandidates,
  };

  // Coin reserve — AFTER the cache miss + gates, BEFORE the Opus call.
  let coinsCharged = false;
  if (options.reserveCoins) {
    const reserve = await options.reserveCoins();
    if (reserve.result === "insufficient") {
      return {
        status: "insufficient_coins",
        balance: reserve.balance,
        needed: reserve.needed,
      };
    }
    if (reserve.result === "error") {
      throw new ReportGenerationError("coin charge failed", "coin_charge_failed");
    }
    coinsCharged = reserve.fresh;
  }

  // From here a charge may be live — any throw refunds before propagating
  // (same backstop shape as generate.ts / billed-generation.ts).
  try {
    const anthropic = new Anthropic({ timeout: ANTHROPIC_TIMEOUT_MS });
    const t0 = Date.now();
    let textBlock: string;
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "disabled" },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      const block = message.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") {
        throw new ReportGenerationError("no text block in response", "no_text");
      }
      textBlock = block.text;
    } catch (err) {
      if (err instanceof ReportGenerationError) throw err;
      throw new ReportGenerationError(
        err instanceof Error ? err.message : "anthropic call failed",
        "api_error",
      );
    }
    const aiDurationMs = Date.now() - t0;

    const raw = textBlock.replace(/```json\n?|```/g, "").trim();
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw new ReportGenerationError("AI output was not JSON", "json_parse");
    }

    const validated = monthlyReportOutputSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new ReportGenerationError(
        `AI output failed schema: ${validated.error.issues[0]?.message ?? "unknown"}`,
        "schema_mismatch",
      );
    }

    let aiOutput: MonthlyReportOutput = validated.data;

    // Banned-phrase walk. Core fields (summary, EQ whys) throw — the report
    // can't ship without them. Droppable sections drop individually instead.
    try {
      if (aiOutput.mode === "report") {
        validateAIOutput({
          summary: aiOutput.summary,
          eq_self_awareness: aiOutput.eq_ratings.self_awareness.why,
          eq_self_management: aiOutput.eq_ratings.self_management.why,
          eq_social_awareness: aiOutput.eq_ratings.social_awareness.why,
          eq_relationship_management:
            aiOutput.eq_ratings.relationship_management.why,
        });
        const cleanRegulation = (
          p: MonthlyReportNormal["trigger_pattern"],
        ): MonthlyReportNormal["trigger_pattern"] => {
          if (!p) return null;
          try {
            validateAIOutput({ statement: p.statement });
            for (const ev of p.evidence) validateAIOutput({ quote: ev.quote });
            return p;
          } catch {
            return null;
          }
        };
        let focusTrend = aiOutput.focus_trend;
        if (focusTrend) {
          try {
            validateAIOutput({ focus_trend: focusTrend });
          } catch {
            focusTrend = null;
          }
        }
        let keyPerson = aiOutput.key_person;
        if (keyPerson) {
          try {
            validateAIOutput({ why: keyPerson.why, tip: keyPerson.tip });
          } catch {
            keyPerson = null;
          }
        }
        aiOutput = {
          ...aiOutput,
          tendencies: aiOutput.tendencies.filter((t) => {
            try {
              validateAIOutput({ tendency: t.tendency });
              for (const ev of t.evidence) validateAIOutput({ quote: ev.quote });
              return true;
            } catch {
              return false;
            }
          }),
          trigger_pattern: cleanRegulation(aiOutput.trigger_pattern),
          overwhelm_pattern: cleanRegulation(aiOutput.overwhelm_pattern),
          top_patterns: aiOutput.top_patterns.filter((p) => {
            try {
              validateAIOutput({ note: p.note });
              return true;
            } catch {
              return false;
            }
          }),
          focus_trend: focusTrend,
          key_person: keyPerson,
        };
      } else {
        validateAIOutput({ message_to_user: aiOutput.message_to_user });
      }
    } catch (err) {
      throw new ReportGenerationError(
        err instanceof Error ? err.message : "banned phrase",
        "banned_phrase",
      );
    }

    // Server verification: quotes, contexts, candidate themes, person names,
    // focus-history presence. Downgrade to refusal if nothing grounded
    // survives — EQ alone is not a sellable report.
    if (aiOutput.mode === "report") {
      const lookup = buildEntryLookup(rawRecords);
      const verified = verifyReport(aiOutput, lookup, entryMeta, {
        contexts: allowedContexts,
        triggerOk,
        overwhelmOk,
        candidateThemes: topPatternCandidates.map((c) => c.theme),
        personNames: personSignals.map((s) => s.name),
        hasFocusHistory: focusHistory.length > 0,
      });
      aiOutput = reportIsViable(verified)
        ? verified
        : {
            mode: "refusal",
            refusal_reason: "out_of_scope",
            message_to_user:
              "I could not ground enough month-level patterns in your own words yet. Keep using Coach and the tools, and try again in a week or two.",
            suggested_resource: "none",
          };
    }

    // Refund on ANY final refusal — direct or downgraded. Charging 80 coins
    // to be told "not enough data" is not a sellable outcome. The refusal row
    // still persists so the 28-day cache prevents a re-charge.
    if (aiOutput.mode === "refusal" && coinsCharged) {
      await options.onChargedGenerationFailed?.();
      coinsCharged = false;
    }

    const insertPayload: MonthlyReportInsert = {
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      input_entry_count: input.entries.length,
      input_window_days: REPORT_INPUT_WINDOW_DAYS,
      report_index: reportIndex,
      generator_version: REPORT_GENERATOR_VERSION,
      prompt_version: prompt.prompt_version,
      ai_json: aiOutput,
      server_json: serverSnapshot,
      ai_duration_ms: aiDurationMs,
    };

    const insertRes = await supabase
      .from("monthly_reports")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertRes.error || !insertRes.data) {
      // 23505 = a concurrent request won the same (user, day, version) race.
      if (insertRes.error?.code === "23505") {
        const winner = await readCachedReport(supabase, userId);
        if (winner) return { status: "cached", row: winner };
      }
      throw new ReportGenerationError(
        `monthly_reports insert failed: ${insertRes.error?.message ?? "no row returned"}`,
        "insert_failed",
      );
    }

    recordEvent(
      "ai.generated",
      {
        area: "ai_spend",
        module: "insights",
        tier: "monthly_report",
        outcome: aiOutput.mode,
      },
      {
        coins: coinsCharged ? COIN_COSTS.monthly_report : 0,
        latencyMs: aiDurationMs,
      },
    );

    return {
      status: "created",
      row: { ...insertRes.data, ai_json: aiOutput, server_json: serverSnapshot },
    };
  } catch (err) {
    if (coinsCharged) {
      await options.onChargedGenerationFailed?.();
    }
    throw err;
  }
}
