// Offline eval harness: compare 6 Claude Sonnet 4.6 config arms on historical
// Prepare / Review / Repair entries. Admin-scoped (reads only the admin user's
// own rows via service-role). Writes 3 CSV artifacts.
//
// Does NOT call runCoachModule. Does NOT call /api/coach/* routes. Does NOT
// write raw_records, prepare_entries, review_entries, repair_entries, or
// pattern_observations. Reuses the existing prompt builders, Zod schemas, and
// banned-phrase validator so the replay matches production validation exactly.
//
// Retry behavior mirrors src/lib/coach/run-module.ts: MAX_RETRIES = 1,
// 400 ms backoff between attempts, same failure-kind taxonomy.
//
// Run: npm run eval:arms

// Next.js convention: app secrets live in .env.local. Dotenv's zero-config
// load target is .env, so point it explicitly at .env.local here.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../src/types/database";
import {
  buildPreparePrompt,
  buildReviewPrompt,
  buildRepairPrompt,
} from "../../src/lib/ai/prompts";
import {
  prepareOutputSchema,
  reviewOutputSchema,
  repairOutputSchema,
  validateAIOutput,
} from "../../src/lib/ai/schemas";
import type { ProfileType } from "../../src/types";
import {
  ARMS,
  MODEL,
  MAX_TOKENS,
  estimateCostUsd,
  type ArmConfig,
  type ArmId,
} from "./arms";
import { serializeCsv, type CsvCell } from "./csv";

// ---- Production-matching constants (from src/lib/coach/run-module.ts) ----
const MAX_RETRIES = 1;
const RETRY_BACKOFF_MS = 400;
const ANTHROPIC_TIMEOUT_MS = 30_000;

// ---- Eval-specific sampling ----
const MODULE_SAMPLE_LIMIT = 10;

type Module = "prepare" | "review" | "repair";
const MODULES: Module[] = ["prepare", "review", "repair"];

const VALID_PROFILES: ProfileType[] = [
  "direct",
  "reflective",
  "warm",
  "measured",
  "perceptive",
  "intense",
];

type FailureKind =
  | "none"
  | "no_text"
  | "json_parse"
  | "schema_mismatch"
  | "banned_phrase"
  | "sdk_error";

// ---- Fetched source row after prompt reconstruction ----
interface SourceEntry {
  module: Module;
  entry_id: string;
  raw_record_id: string | null;
  created_at: string;
  profile_used: ProfileType;
  fields: Record<string, unknown>;
  prompt: { system: string; user: string };
  source_context_blob: string;
}

// ---- Result of running one arm against one source ----
interface ArmResult {
  arm_id: ArmId;
  thinking_mode: ArmConfig["thinking_mode"];
  effort: ArmConfig["effort"];
  latency_ms: number;
  parse_success: boolean;
  schema_success: boolean;
  banned_phrase_success: boolean;
  retry_count: number;
  ai_failure_kind: FailureKind;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  thinking_block_count: number;
  thinking_chars_sum: number;
  estimated_cost_usd: number;
  empty_field_count: number;
  visible_field_count: number;
  stop_reason: string;
  truncated: boolean;
  raw_ai_json: string; // raw text of the model's JSON output (or the raw text if unparseable)
  normalized_output: string; // human-renderable summary of AI output
}

// ---- Environment & clients -------------------------------------------------

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

function buildServiceClient(): SupabaseClient<Database> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SECRET_KEY");
  return createClient<Database>(url, key);
}

async function findAdminUserId(
  service: SupabaseClient<Database>,
  adminEmail: string,
): Promise<string> {
  // auth.admin.listUsers paginates (default perPage 50). Solo-founder scale
  // makes one page sufficient; loop defensively just in case.
  let page = 1;
  const perPage = 200;
  while (page < 50) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`auth.admin.listUsers failed: ${error.message}`);
    }
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === adminEmail.toLowerCase(),
    );
    if (found) return found.id;
    if (data.users.length < perPage) break;
    page += 1;
  }
  throw new Error(`Admin user not found for email: ${adminEmail}`);
}

// ---- Source fetching -------------------------------------------------------

async function fetchRawRecordsByIds(
  service: SupabaseClient<Database>,
  userId: string,
  ids: string[],
): Promise<Map<string, { fields: Record<string, unknown>; profile_used: string }>> {
  const map = new Map<
    string,
    { fields: Record<string, unknown>; profile_used: string }
  >();
  if (ids.length === 0) return map;
  const { data, error } = await service
    .from("raw_records")
    .select("raw_record_id, payload_json")
    .eq("user_id", userId)
    .in("raw_record_id", ids);
  if (error) throw new Error(`raw_records fetch failed: ${error.message}`);
  for (const r of data ?? []) {
    const payload = r.payload_json as
      | { fields?: Record<string, unknown>; profile_used?: string }
      | null;
    if (!payload || !payload.fields || !payload.profile_used) continue;
    map.set(r.raw_record_id, {
      fields: payload.fields,
      profile_used: payload.profile_used,
    });
  }
  return map;
}

async function fetchPrepareSources(
  service: SupabaseClient<Database>,
  userId: string,
): Promise<SourceEntry[]> {
  const { data, error } = await service
    .from("prepare_entries")
    .select(
      "prepare_entry_id, raw_record_id, is_complete, ai_plan_json, deleted_at, created_at",
    )
    .eq("user_id", userId)
    .eq("is_complete", true)
    .not("ai_plan_json", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MODULE_SAMPLE_LIMIT);
  if (error) throw new Error(`prepare fetch failed: ${error.message}`);
  const rows = data ?? [];
  const rawIds = rows
    .map((r) => r.raw_record_id)
    .filter((v): v is string => typeof v === "string");
  const raws = await fetchRawRecordsByIds(service, userId, rawIds);
  const out: SourceEntry[] = [];
  for (const r of rows) {
    if (!r.raw_record_id) continue;
    const raw = raws.get(r.raw_record_id);
    if (!raw) continue;
    const profile = validateProfile(raw.profile_used);
    if (!profile) continue;
    const f = raw.fields;
    const required = [
      "personName",
      "relationship",
      "situation",
      "desiredOutcome",
      "primaryEmotion",
      "defaultPattern",
      "otherPersonHypothesis",
      "realityCheckQuestion",
      "triggerPlan",
    ];
    if (!allNonEmptyStrings(f, required)) continue;
    const prompt = buildPreparePrompt({
      profile,
      personName: String(f.personName),
      relationship: String(f.relationship),
      situation: String(f.situation),
      desiredOutcome: String(f.desiredOutcome),
      primaryEmotion: String(f.primaryEmotion),
      defaultPattern: String(f.defaultPattern),
      otherPersonHypothesis: String(f.otherPersonHypothesis),
      realityCheckQuestion: String(f.realityCheckQuestion),
      triggerPlan: String(f.triggerPlan),
    });
    const context = [
      `Person: ${f.personName} (${f.relationship})`,
      `Situation: ${f.situation}`,
      `Desired outcome: ${f.desiredOutcome}`,
      `Primary emotion: ${f.primaryEmotion}`,
      `Default pattern: ${f.defaultPattern}`,
      `Hypothesis: ${f.otherPersonHypothesis}`,
      `Reality check Q: ${f.realityCheckQuestion}`,
      `Trigger plan: ${f.triggerPlan}`,
    ].join("\n");
    out.push({
      module: "prepare",
      entry_id: r.prepare_entry_id,
      raw_record_id: r.raw_record_id,
      created_at: r.created_at,
      profile_used: profile,
      fields: f,
      prompt,
      source_context_blob: context,
    });
  }
  return out;
}

async function fetchReviewSources(
  service: SupabaseClient<Database>,
  userId: string,
): Promise<SourceEntry[]> {
  const { data, error } = await service
    .from("review_entries")
    .select(
      "review_entry_id, raw_record_id, is_complete, ai_reflection_json, deleted_at, created_at",
    )
    .eq("user_id", userId)
    .eq("is_complete", true)
    .not("ai_reflection_json", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MODULE_SAMPLE_LIMIT);
  if (error) throw new Error(`review fetch failed: ${error.message}`);
  const rows = data ?? [];
  const rawIds = rows
    .map((r) => r.raw_record_id)
    .filter((v): v is string => typeof v === "string");
  const raws = await fetchRawRecordsByIds(service, userId, rawIds);
  const out: SourceEntry[] = [];
  for (const r of rows) {
    if (!r.raw_record_id) continue;
    const raw = raws.get(r.raw_record_id);
    if (!raw) continue;
    const profile = validateProfile(raw.profile_used);
    if (!profile) continue;
    const f = raw.fields;
    const required = [
      "whatHappened",
      "hardestMomentFeeling",
      "observedInThem",
      "theirExperience",
      "whatHelped",
      "whatHurt",
      "unresolvedAndNext",
    ];
    if (!allNonEmptyStrings(f, required)) continue;
    const prompt = buildReviewPrompt({
      profile,
      whatHappened: String(f.whatHappened),
      hardestMomentFeeling: String(f.hardestMomentFeeling),
      observedInThem: String(f.observedInThem),
      theirExperience: String(f.theirExperience),
      whatHelped: String(f.whatHelped),
      whatHurt: String(f.whatHurt),
      validatedAssumptions:
        typeof f.validatedAssumptions === "string"
          ? f.validatedAssumptions
          : "",
      unresolvedAndNext: String(f.unresolvedAndNext),
    });
    const context = [
      `What happened: ${f.whatHappened}`,
      `Hardest moment feeling: ${f.hardestMomentFeeling}`,
      `Observed in them: ${f.observedInThem}`,
      `Their experience: ${f.theirExperience}`,
      `What helped: ${f.whatHelped}`,
      `What hurt: ${f.whatHurt}`,
      `Validated assumptions: ${f.validatedAssumptions ?? ""}`,
      `Unresolved and next: ${f.unresolvedAndNext}`,
    ].join("\n");
    out.push({
      module: "review",
      entry_id: r.review_entry_id,
      raw_record_id: r.raw_record_id,
      created_at: r.created_at,
      profile_used: profile,
      fields: f,
      prompt,
      source_context_blob: context,
    });
  }
  return out;
}

async function fetchRepairSources(
  service: SupabaseClient<Database>,
  userId: string,
): Promise<SourceEntry[]> {
  const { data, error } = await service
    .from("repair_entries")
    .select(
      "repair_entry_id, raw_record_id, is_complete, ai_strategy_json, deleted_at, created_at",
    )
    .eq("user_id", userId)
    .eq("is_complete", true)
    .not("ai_strategy_json", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MODULE_SAMPLE_LIMIT);
  if (error) throw new Error(`repair fetch failed: ${error.message}`);
  const rows = data ?? [];
  const rawIds = rows
    .map((r) => r.raw_record_id)
    .filter((v): v is string => typeof v === "string");
  const raws = await fetchRawRecordsByIds(service, userId, rawIds);
  const out: SourceEntry[] = [];
  for (const r of rows) {
    if (!r.raw_record_id) continue;
    const raw = raws.get(r.raw_record_id);
    if (!raw) continue;
    const profile = validateProfile(raw.profile_used);
    if (!profile) continue;
    const f = raw.fields;
    const required = [
      "whatNeedsRepair",
      "yourResponsibility",
      "theirNeed",
      "desiredOutcome",
      "channel",
      "timing",
    ];
    if (!allNonEmptyStrings(f, required)) continue;
    const prompt = buildRepairPrompt({
      profile,
      whatNeedsRepair: String(f.whatNeedsRepair),
      yourResponsibility: String(f.yourResponsibility),
      theirNeed: String(f.theirNeed),
      desiredOutcome: String(f.desiredOutcome),
      channel: String(f.channel),
      timing: String(f.timing),
    });
    const context = [
      `What needs repair: ${f.whatNeedsRepair}`,
      `What I own: ${f.yourResponsibility}`,
      `What they likely need first: ${f.theirNeed}`,
      `Desired outcome: ${f.desiredOutcome}`,
      `Channel: ${f.channel}`,
      `Timing: ${f.timing}`,
    ].join("\n");
    out.push({
      module: "repair",
      entry_id: r.repair_entry_id,
      raw_record_id: r.raw_record_id,
      created_at: r.created_at,
      profile_used: profile,
      fields: f,
      prompt,
      source_context_blob: context,
    });
  }
  return out;
}

function validateProfile(s: string): ProfileType | null {
  return (VALID_PROFILES as string[]).includes(s) ? (s as ProfileType) : null;
}

function allNonEmptyStrings(
  obj: Record<string, unknown>,
  keys: string[],
): boolean {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v !== "string" || v.trim().length === 0) return false;
  }
  return true;
}

// ---- Arm execution ---------------------------------------------------------

function schemaFor(module: Module) {
  if (module === "prepare") return prepareOutputSchema;
  if (module === "review") return reviewOutputSchema;
  return repairOutputSchema;
}

function renderNormalized(
  module: Module,
  parsed: unknown,
  failureKind: FailureKind,
): string {
  if (failureKind !== "none" || !parsed || typeof parsed !== "object") {
    return `[NO USABLE OUTPUT — failure: ${failureKind}]`;
  }
  const o = parsed as Record<string, unknown>;
  if (module === "prepare") {
    return [
      `Reality-check question: ${str(o.reality_check_question)}`,
      `Thing not to do: ${str(o.thing_not_to_do)}`,
      `Best next move: ${str(o.best_next_move)}`,
      `Pattern tag: ${str(o.pattern_tag)}`,
    ].join("\n");
  }
  if (module === "review") {
    return [
      `How user likely came across: ${str(o.how_user_likely_came_across)}`,
      `Alternative explanation: ${str(o.alternative_explanation)}`,
      `Pattern tag: ${str(o.pattern_tag)}`,
    ].join("\n");
  }
  return [
    `Repair strategy: ${str(o.repair_strategy)}`,
    `Thing not to say: ${str(o.thing_not_to_say)}`,
    `Recommended timing: ${str(o.recommended_timing)}`,
    `Pattern tag: ${str(o.pattern_tag)}`,
  ].join("\n");
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function countFieldPresence(parsed: unknown): {
  empty: number;
  visible: number;
} {
  if (!parsed || typeof parsed !== "object") return { empty: 0, visible: 0 };
  let empty = 0;
  let visible = 0;
  for (const v of Object.values(parsed as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    if (v.trim().length === 0) empty += 1;
    else visible += 1;
  }
  return { empty, visible };
}

async function runOneArm(
  anthropic: Anthropic,
  source: SourceEntry,
  arm: ArmConfig,
): Promise<ArmResult> {
  const started = Date.now();
  const schema = schemaFor(source.module);

  let lastFailure: FailureKind = "none";
  // Set true whenever a validation-layer failure kind is written into
  // `lastFailure` inside the try block. Tells the catch whether the throw
  // came from validation (kind already classified) or from the SDK.
  let classifiedFailure = false;
  let lastRawText = "";
  let lastParsedJson: unknown = null;
  let lastUsage = { input_tokens: 0, output_tokens: 0 };
  let lastThinkingChars = 0;
  let lastThinkingBlocks = 0;
  let lastStopReason = "";
  let finalRetryCount = 0;
  let succeededParse = false;
  let succeededSchema = false;
  let succeededBanned = false;
  let finalValidated: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    classifiedFailure = false;
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: source.prompt.system,
        messages: [{ role: "user", content: source.prompt.user }],
        thinking: arm.thinking,
        output_config: arm.output_config,
      });

      // Usage: thinking tokens are not broken out on SDK 0.89. If a future
      // SDK adds the field, wire it in here. For now: 0 per spec.
      lastUsage = {
        input_tokens: message.usage?.input_tokens ?? 0,
        output_tokens: message.usage?.output_tokens ?? 0,
      };
      lastStopReason = message.stop_reason ?? "";

      // Aggregate thinking-block diagnostics (char count, not tokens).
      let thinkingChars = 0;
      let thinkingBlocks = 0;
      for (const b of message.content) {
        if (b.type === "thinking") {
          thinkingBlocks += 1;
          thinkingChars += (b.thinking ?? "").length;
        }
      }
      lastThinkingChars = thinkingChars;
      lastThinkingBlocks = thinkingBlocks;

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        lastFailure = "no_text";
        classifiedFailure = true;
        throw new Error("no text block");
      }
      lastRawText = textBlock.text.replace(/```json\n?|```/g, "").trim();

      try {
        lastParsedJson = JSON.parse(lastRawText);
        succeededParse = true;
      } catch {
        lastFailure = "json_parse";
        classifiedFailure = true;
        succeededParse = false;
        throw new Error("bad json");
      }

      const validated = schema.safeParse(lastParsedJson);
      if (!validated.success) {
        lastFailure = "schema_mismatch";
        classifiedFailure = true;
        succeededSchema = false;
        throw new Error("schema mismatch");
      }
      succeededSchema = true;

      try {
        validateAIOutput(validated.data as Record<string, unknown>);
        succeededBanned = true;
      } catch {
        lastFailure = "banned_phrase";
        classifiedFailure = true;
        succeededBanned = false;
        throw new Error("banned phrase");
      }

      // All three validation gates passed.
      finalValidated = validated.data;
      lastFailure = "none";
      finalRetryCount = attempt;
      break;
    } catch (err) {
      // If we didn't classify a validation-layer failure in this attempt,
      // the throw originated from the SDK (network / HTTP / API error).
      if (!classifiedFailure) {
        lastFailure = "sdk_error";
      }
      if (attempt < MAX_RETRIES) {
        finalRetryCount = attempt + 1;
        await sleep(RETRY_BACKOFF_MS);
        // reset per-attempt validator success flags (fresh next attempt).
        succeededParse = false;
        succeededSchema = false;
        succeededBanned = false;
      } else {
        finalRetryCount = MAX_RETRIES;
      }
      // Keep lastErr implicit; we only need the kind for metrics.
      void err;
    }
  }

  const latency = Date.now() - started;
  const renderSource = finalValidated ?? lastParsedJson ?? null;
  const presence = countFieldPresence(renderSource);
  const truncated = lastStopReason === "max_tokens";

  return {
    arm_id: arm.id,
    thinking_mode: arm.thinking_mode,
    effort: arm.effort,
    latency_ms: latency,
    parse_success: succeededParse,
    schema_success: succeededSchema,
    banned_phrase_success: succeededBanned,
    retry_count: finalRetryCount,
    ai_failure_kind: lastFailure,
    input_tokens: lastUsage.input_tokens,
    output_tokens: lastUsage.output_tokens,
    thinking_tokens: 0,
    thinking_block_count: lastThinkingBlocks,
    thinking_chars_sum: lastThinkingChars,
    estimated_cost_usd: estimateCostUsd(
      lastUsage.input_tokens,
      lastUsage.output_tokens,
      0,
    ),
    empty_field_count: presence.empty,
    visible_field_count: presence.visible,
    stop_reason: lastStopReason,
    truncated,
    raw_ai_json: lastRawText,
    normalized_output: renderNormalized(source.module, renderSource, lastFailure),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Blind packet shuffling (fresh per source) ----------------------------

function shuffledArmIds(seed: ArmConfig[]): ArmId[] {
  const ids: ArmId[] = seed.map((a) => a.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

const BLIND_SLOTS = ["A", "B", "C", "D", "E", "F"] as const;
type BlindSlot = (typeof BLIND_SLOTS)[number];

// ---- CSV composition -------------------------------------------------------

const MACHINE_HEADER = [
  "eval_batch_id",
  "module",
  "source_entry_id",
  "source_raw_record_id",
  "user_id",
  "arm_id",
  "model",
  "thinking_mode",
  "effort",
  "latency_ms",
  "parse_success",
  "schema_success",
  "banned_phrase_success",
  "retry_count",
  "ai_failure_kind",
  "input_tokens",
  "output_tokens",
  "thinking_tokens",
  "thinking_block_count",
  "thinking_chars_sum",
  "estimated_cost_usd",
  "empty_field_count",
  "visible_field_count",
  "stop_reason",
  "truncated",
  "raw_ai_json",
  "normalized_output",
  "created_at",
];

const REVIEW_PACKET_HEADER = [
  "entry_id",
  "module",
  "blind_label",
  "source_context",
  "normalized_output",
  "specificity_score_1_to_5",
  "correctness_of_read_score_1_to_5",
  "usefulness_of_next_move_score_1_to_5",
  "phrase_level_quality_score_1_to_5",
  "overall_preference_score_1_to_5",
  "would_ship_yes_no",
  "major_issue_note",
];

const ANSWER_KEY_HEADER = ["entry_id", "module", "A", "B", "C", "D", "E", "F"];

// ---- Pareto / summary ------------------------------------------------------

interface ArmAggregate {
  arm_id: ArmId;
  attempts: number;
  parseSuccess: number;
  schemaSuccess: number;
  bannedFailures: number;
  retries: number;
  latencies: number[];
  inputTokens: number[];
  outputTokens: number[];
  thinkingChars: number[];
  cost: number;
  emptyFields: number;
  visibleFields: number;
  truncations: number;
}

function newAggregate(id: ArmId): ArmAggregate {
  return {
    arm_id: id,
    attempts: 0,
    parseSuccess: 0,
    schemaSuccess: 0,
    bannedFailures: 0,
    retries: 0,
    latencies: [],
    inputTokens: [],
    outputTokens: [],
    thinkingChars: [],
    cost: 0,
    emptyFields: 0,
    visibleFields: 0,
    truncations: 0,
  };
}

function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function detectDominated(aggs: ArmAggregate[]): string[] {
  const notes: string[] = [];
  for (const a of aggs) {
    for (const b of aggs) {
      if (a.arm_id === b.arm_id) continue;
      const aAvgLatency = avg(a.latencies);
      const bAvgLatency = avg(b.latencies);
      const aSchemaRate = a.attempts ? a.schemaSuccess / a.attempts : 0;
      const bSchemaRate = b.attempts ? b.schemaSuccess / b.attempts : 0;
      const aParseRate = a.attempts ? a.parseSuccess / a.attempts : 0;
      const bParseRate = b.attempts ? b.parseSuccess / b.attempts : 0;

      // a is strictly dominated by b if b is better or equal on cost AND
      // latency AND reliability AND strictly better on at least one.
      const bBetterCost = b.cost < a.cost;
      const bBetterOrEqualCost = b.cost <= a.cost;
      const bBetterLatency = bAvgLatency < aAvgLatency;
      const bBetterOrEqualLatency = bAvgLatency <= aAvgLatency;
      const bBetterOrEqualReliability =
        bSchemaRate >= aSchemaRate && bParseRate >= aParseRate;
      const bBetterReliability =
        bSchemaRate > aSchemaRate || bParseRate > aParseRate;

      if (
        bBetterOrEqualCost &&
        bBetterOrEqualLatency &&
        bBetterOrEqualReliability &&
        (bBetterCost || bBetterLatency || bBetterReliability)
      ) {
        notes.push(`${a.arm_id} strictly dominated by ${b.arm_id}`);
        break;
      }
    }
  }
  return notes;
}

// ---- Main ------------------------------------------------------------------

async function main(): Promise<void> {
  const adminEmail = requireEnv("ADMIN_EMAIL");
  requireEnv("ANTHROPIC_API_KEY"); // consumed by Anthropic SDK from env
  const service = buildServiceClient();

  // Optional override: EVAL_USER_ID skips the auth.admin.listUsers lookup.
  const userId =
    process.env.EVAL_USER_ID ?? (await findAdminUserId(service, adminEmail));
  console.log(`[eval] user_id=${userId} adminEmail=${adminEmail}`);

  // ---- Fetch sources per module (each capped at MODULE_SAMPLE_LIMIT) ----
  const prepareSrc = await fetchPrepareSources(service, userId);
  const reviewSrc = await fetchReviewSources(service, userId);
  const repairSrc = await fetchRepairSources(service, userId);
  const allSources: SourceEntry[] = [...prepareSrc, ...reviewSrc, ...repairSrc];

  console.log(
    `[eval] sources: prepare=${prepareSrc.length} review=${reviewSrc.length} repair=${repairSrc.length} total=${allSources.length}`,
  );
  if (allSources.length === 0) {
    console.error(
      "[eval] No eligible source entries found. Exiting without writing CSVs.",
    );
    return;
  }

  // ---- Run arms against each source --------------------------------------
  const anthropic = new Anthropic({ timeout: ANTHROPIC_TIMEOUT_MS });
  const batchId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const machineRows: CsvCell[][] = [];
  const reviewRows: CsvCell[][] = [];
  const answerRows: CsvCell[][] = [];

  for (let i = 0; i < allSources.length; i++) {
    const src = allSources[i];
    console.log(
      `[eval] ${i + 1}/${allSources.length} module=${src.module} entry=${src.entry_id}`,
    );

    // Run all 6 arms sequentially. Keeps logs readable and avoids concurrent
    // rate-limit spikes. ~3s/call × 6 = ~18s per source.
    const results: ArmResult[] = [];
    for (const arm of ARMS) {
      const r = await runOneArm(anthropic, src, arm);
      console.log(
        `  [${arm.id}] ${r.latency_ms}ms parse=${r.parse_success} schema=${r.schema_success} banned_ok=${r.banned_phrase_success} retry=${r.retry_count} failure=${r.ai_failure_kind} in=${r.input_tokens} out=${r.output_tokens}`,
      );
      results.push(r);
    }

    // ---- Machine metrics rows ----
    for (const r of results) {
      machineRows.push([
        batchId,
        src.module,
        src.entry_id,
        src.raw_record_id ?? "",
        userId,
        r.arm_id,
        MODEL,
        r.thinking_mode,
        r.effort,
        r.latency_ms,
        r.parse_success,
        r.schema_success,
        r.banned_phrase_success,
        r.retry_count,
        r.ai_failure_kind,
        r.input_tokens,
        r.output_tokens,
        r.thinking_tokens,
        r.thinking_block_count,
        r.thinking_chars_sum,
        r.estimated_cost_usd.toFixed(6),
        r.empty_field_count,
        r.visible_field_count,
        r.stop_reason,
        r.truncated,
        r.raw_ai_json,
        r.normalized_output,
        src.created_at,
      ]);
    }

    // ---- Blind review packet + answer key (fresh permutation per source) ----
    const shuffled = shuffledArmIds([...ARMS]);
    const slotToArm: Partial<Record<BlindSlot, ArmId>> = {};
    for (let s = 0; s < BLIND_SLOTS.length; s++) {
      slotToArm[BLIND_SLOTS[s]] = shuffled[s];
    }
    for (const slot of BLIND_SLOTS) {
      const armId = slotToArm[slot]!;
      const r = results.find((x) => x.arm_id === armId)!;
      reviewRows.push([
        src.entry_id,
        src.module,
        slot,
        src.source_context_blob,
        r.normalized_output,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    }
    answerRows.push([
      src.entry_id,
      src.module,
      slotToArm.A ?? "",
      slotToArm.B ?? "",
      slotToArm.C ?? "",
      slotToArm.D ?? "",
      slotToArm.E ?? "",
      slotToArm.F ?? "",
    ]);
  }

  // ---- Write CSVs --------------------------------------------------------
  const outDir = path.resolve("eval-output", batchId);
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "machine_metrics.csv"),
    serializeCsv(MACHINE_HEADER, machineRows),
    "utf8",
  );
  await writeFile(
    path.join(outDir, "review_packet.csv"),
    serializeCsv(REVIEW_PACKET_HEADER, reviewRows),
    "utf8",
  );
  await writeFile(
    path.join(outDir, "answer_key.csv"),
    serializeCsv(ANSWER_KEY_HEADER, answerRows),
    "utf8",
  );

  // ---- Summary + Pareto --------------------------------------------------
  const byArm: Map<ArmId, ArmAggregate> = new Map();
  for (const a of ARMS) byArm.set(a.id, newAggregate(a.id));
  for (const row of machineRows) {
    const armId = row[5] as ArmId;
    const g = byArm.get(armId);
    if (!g) continue;
    g.attempts += 1;
    if (row[10] === true) g.parseSuccess += 1;
    if (row[11] === true) g.schemaSuccess += 1;
    if (row[12] === false) g.bannedFailures += 1;
    g.retries += Number(row[13]);
    g.latencies.push(Number(row[9]));
    g.inputTokens.push(Number(row[15]));
    g.outputTokens.push(Number(row[16]));
    g.thinkingChars.push(Number(row[19]));
    g.cost += Number(row[20]);
    g.emptyFields += Number(row[21]);
    g.visibleFields += Number(row[22]);
    if (row[24] === true) g.truncations += 1;
  }

  console.log("\n[eval] --- per-arm summary ---");
  console.log(
    [
      "arm_id",
      "n",
      "parse%",
      "schema%",
      "retries",
      "avg_ms",
      "p95_ms",
      "avg_in",
      "avg_out",
      "avg_think_chars",
      "total_cost",
      "truncations",
    ].join("\t"),
  );
  for (const a of ARMS) {
    const g = byArm.get(a.id)!;
    console.log(
      [
        a.id,
        g.attempts,
        pct(g.parseSuccess, g.attempts),
        pct(g.schemaSuccess, g.attempts),
        g.retries,
        Math.round(avg(g.latencies)),
        Math.round(percentile(g.latencies, 0.95)),
        Math.round(avg(g.inputTokens)),
        Math.round(avg(g.outputTokens)),
        Math.round(avg(g.thinkingChars)),
        g.cost.toFixed(4),
        g.truncations,
      ].join("\t"),
    );
  }

  const dominated = detectDominated([...byArm.values()]);
  if (dominated.length > 0) {
    console.log("\n[eval] --- strictly dominated arms ---");
    for (const d of dominated) console.log(`  - ${d}`);
  } else {
    console.log("\n[eval] no strictly dominated arms detected");
  }

  console.log(`\n[eval] wrote CSVs to: ${outDir}`);
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "0%";
  return `${Math.round((num / denom) * 100)}%`;
}

main().catch((err) => {
  console.error("[eval] fatal:", err);
  process.exit(1);
});
