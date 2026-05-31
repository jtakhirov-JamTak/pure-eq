// Weekly reflection orchestrator.
//
// Reads the user's last ~4 weeks of entries, calls Claude Opus 4.7 to
// produce 2–3 blind-spot observations with quoted evidence, verifies
// each quote is a substring of its cited source entry, and persists
// the result to `weekly_reflections`.
//
// MODEL SCOPE (important): this is the ONLY place Opus 4.7 is used.
// Coach (Prepare/Review/Repair) stays on Sonnet 4.6 via
// src/lib/coach/run-module.ts. Do not merge the two client setups —
// keeping them physically separate prevents a future edit to one from
// drifting the other.
//
// INSERT FAILURE HANDLING: the INSERT inspects `.error` explicitly and
// throws on failure. Caller returns HTTP 500 + Sentry-captures. This
// is the direct lesson from migration 0018 (writer-silently-failing
// incident). Fire-and-forget is banned on this path.

import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { buildReflectionPrompt, type BehavioralContext } from "@/lib/ai/prompts";
import {
  reflectionOutputSchema,
  validateAIOutput,
  type ReflectionOutput,
  type ReflectionNormal,
} from "@/lib/ai/schemas";
import { REVIEW_NEEDS_NEXT_VALUES as REVIEW_NEEDS_NEXT_ENUM } from "@/lib/validation";
import { buildReflectionInput } from "./reflection-input";
import type { ProfileType } from "@/types";
import type { WeeklyReflectionRow, WeeklyReflectionInsert } from "./types";

// v3 (2026-05-03): Tools restored. The reflection prompt's FIELD GLOSSARY
// re-includes trigger_log + overwhelmed bullets, and the input record_type
// filter once again pulls Tools entries. v2 cached rows from the 6-day
// removal window (2026-04-25 → 2026-05-03) were generated without Tools
// signal; bumping to v3 forces recompute via the writer-side symmetric
// guard so users see reflections that include their Tools entries.
//
// v2 (2026-04-23): reflection prompt now includes FIELD GLOSSARY + optional
// BEHAVIORAL CONTEXT block (BYS verdicts + Review repair-branch counters).
// Migration 0031 moved generator_version into the weekly_reflections unique
// index, so a mid-week version bump is handled natively by an INSERT of a
// new (user_id, date, version) row — no UPDATE fallback needed.
export const GENERATOR_VERSION = "reflection_v3";

// Allowlist for review.needs_to_happen_next. Gates arbitrary DB strings
// (legacy rows, schema drift) from leaking into the prompt. Single source
// is the tuple in validation.ts; adding a new value there propagates to
// Zod + this Set + the FIELD GLOSSARY prompt interpolation.
const REVIEW_NEEDS_NEXT_SET: ReadonlySet<string> = new Set(REVIEW_NEEDS_NEXT_ENUM);

// Minimum quote length for reflection evidence. Filters degenerate
// single-word "quotes" like "apologize" or "boundary" — common in user
// entries AND in the new FIELD GLOSSARY — that would trivially pass
// substring verification but convey no meaningful evidence. English-text
// assumption: requires an ASCII space between tokens. i18n is not in scope.
// Exported so tests can reference the boundary instead of hardcoding lengths.
export const MIN_QUOTE_CHARS = 6;

// Cooldown-latched Sentry capture for non-fatal aggregate-query errors.
// Module-level state so a persistent outage emits at most one event per
// kind per 5 minutes across the Node instance (matches rate-limit.ts
// reference pattern per CLAUDE.md parallel-fetch-error rule).
const AGGREGATE_CAPTURE_COOLDOWN_MS = 5 * 60 * 1000;
let lastBysAggregateCaptureAt = 0;
let lastReviewAggregateCaptureAt = 0;
export const IDEMPOTENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const INPUT_WINDOW_DAYS = 28;

// Minimum number of completed Coach entries (all-time, across Prepare, Review,
// Repair, Pulse Check) required before the FIRST weekly reflection can be
// generated. Below this there isn't enough material to ground a reflection in
// the user's own words, so /insights shows a locked "N of 5" state and the
// server refuses to generate. Tools (Overwhelmed/Triggered) and Before-You-Send
// deliberately do NOT count — the gate is scoped to the four reflective modules.
// Enforced server-side here AND mirrored in the page UI (single source: the
// constant + record-type list below).
export const MIN_ENTRIES_FOR_REFLECTION = 5;
export const REFLECTION_GATE_RECORD_TYPES = [
  "prepare",
  "review",
  "repair",
  "pulse_check",
] as const;

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 1500;
const ANTHROPIC_TIMEOUT_MS = 45_000;
const INPUT_WINDOW_MS = INPUT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

type GenerateOutcome =
  | { status: "cached"; row: WeeklyReflectionRow }
  | { status: "created"; row: WeeklyReflectionRow }
  | { status: "profile_missing" }
  | { status: "insufficient_entries"; count: number; needed: number }
  | { status: "insufficient_coins"; balance: number; needed: number };

export class ReflectionGenerationError extends Error {
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
    this.name = "ReflectionGenerationError";
  }
}

export interface GenerateOptions {
  /**
   * Called after cache miss, immediately BEFORE the LLM call — the cost gate
   * (Slice B3: weekly reflection costs coins). Kept as a
   * caller-supplied callback for the same reason as checkRateLimit: the
   * generator stays ignorant of the coins economy (no coins import here), and
   * cache hits never reach this point so a re-visit inside the 7-day window is
   * never charged. Mirrors run-module.ts reserve-at-start semantics.
   *   - "charged" + fresh:true  → THIS call debited the coins. Proceed;
   *                      onChargedGenerationFailed below refunds if generation
   *                      fails AFTER this point.
   *   - "charged" + fresh:false → a prior/concurrent attempt under the same
   *                      spend key already paid (spend_coins → 'already_applied').
   *                      Proceed, but DO NOT refund on failure — we'd be
   *                      reversing the OTHER request's charge. Mirrors
   *                      run-module.ts (`coinsCharged = spend === 'ok'`).
   *   - "insufficient" → balance too low; generateReflection returns
   *                      {status:"insufficient_coins"} WITHOUT calling the LLM.
   *   - "error"        → unexpected charge failure (DB hiccup); we throw rather
   *                      than generate something we couldn't charge for (fail
   *                      closed, same stance as coins.ts).
   */
  reserveCoins?: () => Promise<
    | { result: "charged"; fresh: boolean }
    | { result: "insufficient"; balance: number; needed: number }
    | { result: "error" }
  >;

  /**
   * Compensating refund hook. Called when a charged generation does NOT deliver
   * a usable reflection: an AI/insert failure (the LLM never produced output),
   * OR a refusal ("not enough patterns this week") — charging 20 coins to be
   * told there isn't enough data yet is a bad deal, so we release it. The
   * refusal row is still persisted (so the cache short-circuit prevents a
   * re-charge that same week), but the coins are returned.
   */
  onChargedGenerationFailed?: () => Promise<void>;
}

/**
 * Verify each observation's quotes substring-match their cited source entry.
 * Drops observations with any unverifiable quote. Returns the filtered set.
 * If fewer than 2 observations survive, caller downgrades to refusal.
 */
// Exported for unit tests.
export function verifyQuotes(
  reflection: ReflectionNormal,
  entryLookup: Map<string, string>, // raw_record_id → concatenated fields text
): ReflectionNormal {
  const verified = reflection.observations.filter((obs) => {
    return obs.evidence.every((ev) => {
      const trimmed = ev.quote.trim();
      // Defense-in-depth: reject degenerate single-word quotes. The FIELD
      // GLOSSARY in the prompt contains enum tokens (apologize, boundary,
      // clarify, etc.) that are also common in user text — a single-word
      // "quote" would verify trivially via substring match but carry no
      // evidentiary weight. Require at least one internal space.
      if (!trimmed.includes(" ") || trimmed.length < MIN_QUOTE_CHARS) return false;
      const source = entryLookup.get(ev.source_record_id);
      if (!source) return false;
      return source.includes(ev.quote);
    });
  });
  return { ...reflection, observations: verified };
}

/**
 * Aggregate derived-table rows into the BehavioralContext framing block
 * passed to the reflection prompt. Never quoted as evidence — purely
 * framing for what patterns the model should look for.
 *
 * Exported for unit tests. Callers should always invoke via generate(),
 * which wires in the actual DB reads + window.
 */
export function aggregateBehavioralContext(
  bysRows: Array<{ ai_verdict_json: unknown }>,
  reviewRows: Array<{ repair_branch_active: boolean; needs_to_happen_next: string | null }>,
): BehavioralContext {
  const bys = { total: 0, safe: 0, risky: 0, do_not_send: 0 };
  for (const row of bysRows) {
    const verdict =
      row.ai_verdict_json &&
      typeof row.ai_verdict_json === "object" &&
      !Array.isArray(row.ai_verdict_json)
        ? (row.ai_verdict_json as Record<string, unknown>).verdict
        : null;
    if (verdict === "safe") {
      bys.safe += 1;
      bys.total += 1;
    } else if (verdict === "risky") {
      bys.risky += 1;
      bys.total += 1;
    } else if (verdict === "do_not_send") {
      bys.do_not_send += 1;
      bys.total += 1;
    }
    // Unknown verdict strings (legacy rows, schema drift) don't count.
  }

  const review = {
    total: 0,
    repair_branch_active: 0,
    no_repair_branch: 0,
    needs_next: {} as Record<string, number>,
  };
  for (const row of reviewRows) {
    review.total += 1;
    if (row.repair_branch_active) {
      review.repair_branch_active += 1;
    } else {
      review.no_repair_branch += 1;
    }
    // Allowlist-gate: legacy or schema-drifted values don't leak into the
    // prompt. Unknown strings are counted toward review.total but not
    // broken out in needs_next.
    if (row.needs_to_happen_next && REVIEW_NEEDS_NEXT_SET.has(row.needs_to_happen_next)) {
      review.needs_next[row.needs_to_happen_next] =
        (review.needs_next[row.needs_to_happen_next] ?? 0) + 1;
    }
  }

  return { windowDays: INPUT_WINDOW_DAYS, bys, review };
}

/**
 * Build a flat searchable-text index per raw_record, so quote verification
 * is O(observations × evidence) with O(1) per check.
 */
function buildEntryLookup(
  rawRecords: Array<{ raw_record_id: string; payload_json: unknown }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rawRecords) {
    if (!r.payload_json || typeof r.payload_json !== "object") continue;
    const payload = r.payload_json as Record<string, unknown>;
    const fields = payload.fields;
    if (!fields || typeof fields !== "object") continue;
    const joined = Object.values(fields as Record<string, unknown>)
      .filter((v) => typeof v === "string")
      .join("\n");
    map.set(r.raw_record_id, joined);
  }
  return map;
}

/**
 * Count the user's all-time completed, non-deleted entries across the four
 * reflective Coach modules (Prepare/Review/Repair/Pulse Check). This is the
 * gate for the first weekly reflection (MIN_ENTRIES_FOR_REFLECTION). Throws
 * db_read_failed on query error so the caller fails CLOSED (no generation,
 * no charge) rather than generating on a bad count. `head: true` makes this a
 * COUNT-only query — no rows transferred.
 */
export async function countReflectionEligibleEntries(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("raw_records")
    .select("raw_record_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("record_type", [...REFLECTION_GATE_RECORD_TYPES])
    .eq("is_complete", true)
    .is("deleted_at", null);
  if (error) {
    throw new ReflectionGenerationError(
      `raw_records count failed: ${error.message}`,
      "db_read_failed",
    );
  }
  return count ?? 0;
}

/**
 * Fetch the latest fresh+current-version row for this user, validate its
 * ai_json shape, and return it — or null if no usable cache exists.
 *
 * Returns null when: no row inside window, version mismatch, or ai_json
 * fails Zod validation (legacy/hand-edited rows fall through to regen
 * rather than render a broken card — CLAUDE.md jsonb read-side defense).
 */
async function readCachedReflection(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<WeeklyReflectionRow | null> {
  const cutoff = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS).toISOString();
  const latestQuery = await supabase
    .from("weekly_reflections")
    .select("*")
    .eq("user_id", userId)
    .eq("generator_version", GENERATOR_VERSION)
    .gte("generated_at", cutoff)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestQuery.error) {
    throw new ReflectionGenerationError(
      `weekly_reflections lookup failed: ${latestQuery.error.message}`,
      "db_read_failed",
    );
  }
  if (!latestQuery.data) return null;

  const aiJsonParse = reflectionOutputSchema.safeParse(latestQuery.data.ai_json);
  if (!aiJsonParse.success) return null; // legacy shape — fall through to regen

  return {
    ...latestQuery.data,
    ai_json: aiJsonParse.data,
  };
}

/**
 * Generate (or return cached) weekly reflection for a user.
 *
 * `supabase` MUST be a service-role client because the INSERT bypasses RLS
 * (the table has no INSERT policy). Caller must have already authorized
 * the user (auth + paid-access gate) before calling.
 */
export async function generateReflection(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: GenerateOptions = {},
): Promise<GenerateOutcome> {
  // Idempotency short-circuit: if the latest row is < 7 days old AND matches
  // the current generator_version, return it without calling Claude. This is
  // the PRIMARY cost gate — regardless of rate limits, regardless of how
  // many times the user refreshes, there is no way to trigger more than one
  // LLM call per 7 days.
  //
  // The generator_version filter is the writer half of the symmetric guard
  // in Playbook §16.17. A version bump must force regeneration even inside
  // the 7-day window, otherwise stale-shape rows keep feeding the reader
  // that already rejected them.
  const cachedRow = await readCachedReflection(supabase, userId);
  if (cachedRow) {
    return { status: "cached", row: cachedRow };
  }

  // Entry-count gate: the first reflection requires at least
  // MIN_ENTRIES_FOR_REFLECTION completed entries across the four reflective
  // modules. Checked AFTER the cache short-circuit (an already-generated
  // reflection still renders even if entries were later deleted below the
  // threshold) and BEFORE the profile read + coin reserve, so a user below the
  // bar is never charged. Mirrored in the /insights page UI; this is the
  // un-bypassable half.
  const eligibleEntries = await countReflectionEligibleEntries(supabase, userId);
  if (eligibleEntries < MIN_ENTRIES_FOR_REFLECTION) {
    return {
      status: "insufficient_entries",
      count: eligibleEntries,
      needed: MIN_ENTRIES_FOR_REFLECTION,
    };
  }

  // Fetch profile.
  const profileRes = await supabase
    .from("user_profiles")
    .select("primary_profile")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (profileRes.error) {
    throw new ReflectionGenerationError(
      `user_profiles lookup failed: ${profileRes.error.message}`,
      "db_read_failed",
    );
  }
  if (!profileRes.data) {
    return { status: "profile_missing" };
  }
  const profile = profileRes.data.primary_profile as ProfileType;

  // Fetch persons + recent raw entries + BYS + Review aggregates in parallel.
  // BYS and Review queries drive the BEHAVIORAL CONTEXT block in the prompt
  // — framing only, never quoted as evidence. On error we emit empty
  // counters rather than failing the reflection (supplementary enrichment).
  const periodStartMs = Date.now() - INPUT_WINDOW_MS;
  const periodStart = new Date(periodStartMs).toISOString();
  const periodEnd = new Date().toISOString();

  const [personsRes, entriesRes, bysRes, reviewRes] = await Promise.all([
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
      .in("record_type", ["prepare", "review", "repair", "trigger_log", "overwhelmed"])
      .eq("is_complete", true)
      .is("deleted_at", null)
      .gte("created_at", periodStart)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("before_you_send_entries")
      .select("ai_verdict_json")
      .eq("user_id", userId)
      .eq("is_complete", true)
      .is("deleted_at", null)
      .gte("created_at", periodStart)
      .not("ai_verdict_json", "is", null)
      .limit(200),
    supabase
      .from("review_entries")
      .select("repair_branch_active, needs_to_happen_next")
      .eq("user_id", userId)
      .eq("is_complete", true)
      .is("deleted_at", null)
      .gte("created_at", periodStart)
      .limit(200),
  ]);

  if (personsRes.error) {
    throw new ReflectionGenerationError(
      `persons lookup failed: ${personsRes.error.message}`,
      "db_read_failed",
    );
  }
  if (entriesRes.error) {
    throw new ReflectionGenerationError(
      `raw_records lookup failed: ${entriesRes.error.message}`,
      "db_read_failed",
    );
  }
  // BYS + Review aggregate errors are non-fatal — counters are supplementary
  // framing, not evidence, so a failed read should not block the reflection.
  // But a persistent outage (RLS drift, schema change) needs telemetry, so
  // capture with 5-min cooldown per kind per the parallel-fetch-error rule.
  // Synthetic Error wrapper: never ship PostgrestError.message to Sentry —
  // it can contain column values on conflict.
  if (bysRes.error) {
    const now = Date.now();
    if (now - lastBysAggregateCaptureAt > AGGREGATE_CAPTURE_COOLDOWN_MS) {
      lastBysAggregateCaptureAt = now;
      Sentry.captureException(new Error("bys_aggregate_read_failed"), {
        tags: { area: "insights_generate", kind: "bys_aggregate_read" },
      });
    }
    console.error("insights: bys_aggregate_read_failed");
  }
  if (reviewRes.error) {
    const now = Date.now();
    if (now - lastReviewAggregateCaptureAt > AGGREGATE_CAPTURE_COOLDOWN_MS) {
      lastReviewAggregateCaptureAt = now;
      Sentry.captureException(new Error("review_aggregate_read_failed"), {
        tags: { area: "insights_generate", kind: "review_aggregate_read" },
      });
    }
    console.error("insights: review_aggregate_read_failed");
  }

  const rawRecords = entriesRes.data ?? [];
  const persons = personsRes.data ?? [];
  const behavioralContext = aggregateBehavioralContext(
    bysRes.data ?? [],
    reviewRes.data ?? [],
  );

  // Build the structured USER INPUT block. Caps entries at 50 + truncates
  // each field to 400 chars for a deterministic token budget.
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

  const prompt = buildReflectionPrompt({
    profile,
    persons: input.persons,
    entries: input.entries,
    behavioralContext,
  });

  // Coin reserve (Slice B3) — AFTER the cache miss, BEFORE the LLM call. A
  // cache hit returns long before this line, so re-visiting /insights inside
  // the 7-day window is never charged. Reserve-at-start (not finalize-on-
  // success) so a user below the price can't trigger an Opus generation we
  // then fail to bill. (Per-minute flood protection lives at the route entry,
  // before this function is even called — the weekly cost-limit was retired in
  // B3 since the coin debit is now the cost gate.)
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
      // Charge failed unexpectedly (DB hiccup) — fail closed rather than
      // generate a reflection we couldn't bill for. Route maps to 500.
      throw new ReflectionGenerationError(
        "coin charge failed",
        "coin_charge_failed",
      );
    }
    // Only refund on failure if THIS call actually debited (fresh). An
    // 'already_applied' spend (fresh:false) means a concurrent/prior request
    // under the same key paid — refunding here would reverse THAT request's
    // charge while it still returns a reflection (free generation). Same guard
    // as run-module.ts's `coinsCharged = spend === "ok"`.
    coinsCharged = reserve.fresh;
  }

  // From here on a charge may be live. Wrap generation + persist in a try so any
  // THROW (LLM failure, schema/banned-phrase, insert failure) refunds before
  // propagating. Early `return`s exit cleanly without refund — the 23505 race
  // winner returns "cached" with a real row and intentionally keeps the charge
  // (the user got a reflection; only one of two racing requests charges under
  // the per-attempt key). A refusal downgrade refunds explicitly below (it
  // returns, not throws) since the user got told "not enough data", not a
  // reflection.
  try {
    // Call Claude. Fresh Anthropic client — NOT shared with Coach's Sonnet
    // setup, and NOT going through runCoachModule (see file header).
    const anthropic = new Anthropic({ timeout: ANTHROPIC_TIMEOUT_MS });
    const t0 = Date.now();
    let textBlock: string;
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "disabled" },
        // output_config omitted — Opus defaults on the current SDK perform
        // well for this task; we can tighten to effort=high if blind evals
        // show benefit. Sonnet's pinned effort=high is a separate config
        // per model-scope rule.
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      const block = message.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") {
        throw new ReflectionGenerationError("no text block in response", "no_text");
      }
      textBlock = block.text;
    } catch (err) {
      if (err instanceof ReflectionGenerationError) throw err;
      throw new ReflectionGenerationError(
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
      throw new ReflectionGenerationError("AI output was not JSON", "json_parse");
    }

    const validated = reflectionOutputSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new ReflectionGenerationError(
        `AI output failed schema: ${validated.error.issues[0]?.message ?? "unknown"}`,
        "schema_mismatch",
      );
    }

    let aiOutput: ReflectionOutput = validated.data;

    // Banned-phrase check on all string leaves. validateAIOutput walks the
    // top-level keys only — the reflection shape nests prose under theme,
    // observation, summary, message_to_user, AND evidence[*].quote. The quote
    // walk matters: the model can select a verbatim passage from the user's
    // own text that contains a banned clinical phrase. We drop the observation
    // (not just the evidence item) so the <2 → refusal path still engages.
    try {
      if (aiOutput.mode === "reflection") {
        validateAIOutput({ summary: aiOutput.summary });
        aiOutput = {
          ...aiOutput,
          observations: aiOutput.observations.filter((obs) => {
            try {
              validateAIOutput({ theme: obs.theme, observation: obs.observation });
              for (const ev of obs.evidence) {
                validateAIOutput({ quote: ev.quote });
              }
              return true;
            } catch {
              return false;
            }
          }),
        };
      } else {
        validateAIOutput({ message_to_user: aiOutput.message_to_user });
      }
    } catch (err) {
      throw new ReflectionGenerationError(
        err instanceof Error ? err.message : "banned phrase",
        "banned_phrase",
      );
    }

    // Post-process: verify quotes substring-match their cited sources. If any
    // observation has an unverifiable quote, drop the whole observation. If
    // fewer than 2 observations survive (counting banned-phrase drops above),
    // convert to a refusal — we can't serve a partial reflection.
    if (aiOutput.mode === "reflection") {
      const lookup = buildEntryLookup(rawRecords);
      const filtered = verifyQuotes(aiOutput, lookup);
      if (filtered.observations.length < 2) {
        aiOutput = {
          mode: "refusal",
          refusal_reason: "out_of_scope",
          message_to_user:
            "I could not ground enough patterns in your own words this week. Keep using Coach and Tools for another week or two and come back.",
          suggested_resource: "none",
        };
        // A refusal isn't a sellable reflection — release the hold (Slice B3).
        // The refusal row is still persisted below so the 7-day cache short-
        // circuit prevents a re-charge this week. Clear coinsCharged so the
        // outer catch can't refund a second time if the INSERT then throws
        // (the refund is idempotent on its ref_key anyway, but be explicit).
        if (coinsCharged) {
          await options.onChargedGenerationFailed?.();
          coinsCharged = false;
        }
      } else {
        aiOutput = filtered;
      }
    }

    // Persist. Fail loudly on INSERT error — migration 0018 lesson.
    const insertPayload: WeeklyReflectionInsert = {
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      input_entry_count: input.entries.length,
      input_window_days: INPUT_WINDOW_DAYS,
      generator_version: GENERATOR_VERSION,
      prompt_version: prompt.prompt_version,
      ai_json: aiOutput,
      ai_duration_ms: aiDurationMs,
    };

    const insertRes = await supabase
      .from("weekly_reflections")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertRes.error || !insertRes.data) {
      // Unique-violation (PG 23505) = a concurrent request won the race at the
      // same (user_id, date, generator_version) triple (migration 0031). Two
      // parallel POSTs both missing the cache produce one LLM charge + one
      // INSERT, not two. Return the winner's row as "cached". A same-day row
      // at a DIFFERENT generator_version cannot 23505 here — the index keys
      // off version, so a fresh v_new INSERT coexists with a stale v_old row.
      if (insertRes.error?.code === "23505") {
        const winner = await readCachedReflection(supabase, userId);
        if (winner) return { status: "cached", row: winner };
        // Fell through the cache read — ai_json failed Zod validation on the
        // winning row (legacy shape, hand edit). Fail loudly rather than
        // silently serve a blank reflection.
      }
      throw new ReflectionGenerationError(
        `weekly_reflections insert failed: ${insertRes.error?.message ?? "no row returned"}`,
        "insert_failed",
      );
    }

    // Freshly-written row — ai_json is the Zod-validated aiOutput we just
    // inserted, so narrowing here is safe (not a blind jsonb read).
    return {
      status: "created",
      row: { ...insertRes.data, ai_json: aiOutput },
    };
  } catch (err) {
    // Any throw past the coin reserve means a charged generation failed to
    // deliver — refund the hold (release) before propagating. Idempotent on
    // the spend key, so a refusal that already refunded + cleared coinsCharged
    // won't double-refund. db_read/profile failures occur BEFORE the reserve,
    // so coinsCharged is false there and no phantom coins are created.
    if (coinsCharged) {
      await options.onChargedGenerationFailed?.();
    }
    throw err;
  }
}
