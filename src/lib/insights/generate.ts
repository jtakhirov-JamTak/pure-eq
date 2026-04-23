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
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { buildReflectionPrompt } from "@/lib/ai/prompts";
import {
  reflectionOutputSchema,
  validateAIOutput,
  type ReflectionOutput,
  type ReflectionNormal,
} from "@/lib/ai/schemas";
import { buildReflectionInput } from "./reflection-input";
import type { ProfileType } from "@/types";
import type { WeeklyReflectionRow, WeeklyReflectionInsert } from "./types";

export const GENERATOR_VERSION = "reflection_v1";
export const IDEMPOTENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const INPUT_WINDOW_DAYS = 28;

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 1500;
const ANTHROPIC_TIMEOUT_MS = 45_000;
const INPUT_WINDOW_MS = INPUT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

type GenerateOutcome =
  | { status: "cached"; row: WeeklyReflectionRow }
  | { status: "created"; row: WeeklyReflectionRow }
  | { status: "profile_missing" };

export class ReflectionGenerationError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "no_text"
      | "json_parse"
      | "schema_mismatch"
      | "banned_phrase"
      | "api_error"
      | "insert_failed",
  ) {
    super(message);
    this.name = "ReflectionGenerationError";
  }
}

/**
 * Verify each observation's quotes substring-match their cited source entry.
 * Drops observations with any unverifiable quote. Returns the filtered set.
 * If fewer than 2 observations survive, caller downgrades to refusal.
 */
function verifyQuotes(
  reflection: ReflectionNormal,
  entryLookup: Map<string, string>, // raw_record_id → concatenated fields text
): ReflectionNormal {
  const verified = reflection.observations.filter((obs) => {
    return obs.evidence.every((ev) => {
      const source = entryLookup.get(ev.source_record_id);
      if (!source) return false;
      return source.includes(ev.quote);
    });
  });
  return { ...reflection, observations: verified };
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
 * Generate (or return cached) weekly reflection for a user.
 *
 * `supabase` MUST be a service-role client because the INSERT bypasses RLS
 * (the table has no INSERT policy). Caller must have already authorized
 * the user (auth + paid-access gate) before calling.
 */
export async function generateReflection(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<GenerateOutcome> {
  // Idempotency short-circuit: if the latest row is < 7 days old, return it
  // without calling Claude. This is the PRIMARY cost gate — regardless of
  // rate limits, regardless of how many times the user refreshes, there is
  // no way to trigger more than one LLM call per 7 days.
  const cutoff = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS).toISOString();
  const latestQuery = await supabase
    .from("weekly_reflections")
    .select("*")
    .eq("user_id", userId)
    .gte("generated_at", cutoff)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestQuery.error) {
    throw new ReflectionGenerationError(
      `weekly_reflections lookup failed: ${latestQuery.error.message}`,
      "insert_failed",
    );
  }
  if (latestQuery.data) {
    return {
      status: "cached",
      row: latestQuery.data as unknown as WeeklyReflectionRow,
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
      "insert_failed",
    );
  }
  if (!profileRes.data) {
    return { status: "profile_missing" };
  }
  const profile = profileRes.data.primary_profile as ProfileType;

  // Fetch persons + recent raw entries in parallel.
  const periodStartMs = Date.now() - INPUT_WINDOW_MS;
  const periodStart = new Date(periodStartMs).toISOString();
  const periodEnd = new Date().toISOString();

  const [personsRes, entriesRes] = await Promise.all([
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
  ]);

  if (personsRes.error) {
    throw new ReflectionGenerationError(
      `persons lookup failed: ${personsRes.error.message}`,
      "insert_failed",
    );
  }
  if (entriesRes.error) {
    throw new ReflectionGenerationError(
      `raw_records lookup failed: ${entriesRes.error.message}`,
      "insert_failed",
    );
  }

  const rawRecords = entriesRes.data ?? [];
  const persons = personsRes.data ?? [];

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
  });

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

  // Banned-phrase check on all string leaves. validateAIOutput only walks
  // top-level keys; for the reflection shape we also need to walk theme +
  // observation + summary + message_to_user. Flatten relevant strings.
  try {
    if (aiOutput.mode === "reflection") {
      validateAIOutput({ summary: aiOutput.summary });
      for (const obs of aiOutput.observations) {
        validateAIOutput({ theme: obs.theme, observation: obs.observation });
      }
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
  // fewer than 2 observations survive, convert to a refusal — the model
  // fabricated quotes and we can't serve a partial reflection.
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
    throw new ReflectionGenerationError(
      `weekly_reflections insert failed: ${insertRes.error?.message ?? "no row returned"}`,
      "insert_failed",
    );
  }

  return {
    status: "created",
    row: insertRes.data as unknown as WeeklyReflectionRow,
  };
}
