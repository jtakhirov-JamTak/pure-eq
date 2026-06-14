// Shared Coach AI-generation primitives: the model call (with retry/validate)
// and the derived-row persist. Extracted from run-module.ts so the regenerate
// route (src/app/api/coach/regenerate/route.ts) can reuse the EXACT same model
// config, retry policy, validation, and write — re-implementing them would risk
// drift on the pinned model config (Sonnet 4.6, thinking off, effort high) and
// the banned-phrase gate. run-module.ts and the regenerate route are the two
// callers; both wrap these in runBilledGeneration's reserve/refund.

import type { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { validateAIOutput } from "@/lib/ai/schemas";
import { extractHeadline } from "@/lib/coach/conversation-summary";
import type { GenerationResult } from "@/lib/coach/billed-generation";
import type { CoachModuleConfig } from "@/lib/coach/types";
import type { ZodType } from "zod";

const MAX_RETRIES = 1;
const ANTHROPIC_TIMEOUT_MS = 30_000;

type CoachSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Call Claude for a Coach module, with the pinned model config, a single retry,
 * JSON-parse + schema + banned-phrase validation. Never throws — returns a
 * GenerationResult whose aiOutput is null on total failure (the caller refunds).
 * Model config is pinned per the 2026-04-20 blind eval (Sonnet 4.6 + thinking
 * disabled + effort high); do not change without re-running `npm run eval:arms`.
 */
export async function runCoachAiCall<TAiOutput extends Record<string, unknown>>(
  moduleName: string,
  prompt: { system: string; user: string },
  aiOutputSchema: ZodType,
): Promise<GenerationResult<TAiOutput>> {
  const anthropic = new Anthropic({ timeout: ANTHROPIC_TIMEOUT_MS });
  let aiOutput: TAiOutput | null = null;
  let failureKind = "none";
  let lastErr: unknown = null;
  let attempts = 0;
  const aiCallStart = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        thinking: { type: "disabled" },
        output_config: { effort: "high" },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        failureKind = "no_text";
        throw new Error("no text block");
      }
      const raw = textBlock.text.replace(/```json\n?|```/g, "").trim();
      let jsonOutput: unknown;
      try {
        jsonOutput = JSON.parse(raw);
      } catch {
        failureKind = "json_parse";
        throw new Error("bad json");
      }
      const validated = aiOutputSchema.safeParse(jsonOutput);
      if (!validated.success) {
        failureKind = "schema_mismatch";
        throw new Error("schema mismatch");
      }
      try {
        aiOutput = validateAIOutput(
          validated.data as Record<string, unknown>,
        ) as TAiOutput;
      } catch {
        failureKind = "banned_phrase";
        throw new Error("banned phrase");
      }
      failureKind = "none";
      attempts = attempt + 1;
      break;
    } catch (err) {
      lastErr = err;
      console.error(`${moduleName}: AI attempt ${attempt + 1} failed kind=${failureKind}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  return {
    aiOutput,
    failureKind,
    lastErr,
    attempts,
    latencyMs: Date.now() - aiCallStart,
  };
}

/**
 * Write a validated AI output onto its derived row: the ai json + version,
 * extractDerivedFromAi promotions (e.g. Prepare's predicted_reaction +
 * conversation_type classification), the denormalized headline, and the
 * completion flags — all in one atomic update. Returns { error: true } on a DB
 * failure so the caller (runBilledGeneration) can refund. Used for both the
 * first generation (run-module) and a paid regeneration (regenerate route).
 */
export async function persistCoachAiOutput<
  TInput extends Record<string, unknown>,
  TAiOutput extends Record<string, unknown>,
>(
  supabase: CoachSupabase,
  config: CoachModuleConfig<TInput, TAiOutput>,
  userId: string,
  derivedEntryId: string,
  aiOutput: TAiOutput,
): Promise<{ error: boolean }> {
  const derivedFromAi = config.extractDerivedFromAi
    ? config.extractDerivedFromAi(aiOutput)
    : {};
  const headlineUpdate = config.headlineColumn
    ? { [config.headlineColumn]: extractHeadline(config.moduleName, aiOutput) }
    : {};
  const updateResult = await (
    supabase.from(config.derivedTable) as ReturnType<typeof supabase.from>
  )
    .update({
      [config.aiJsonColumn]: aiOutput,
      [config.aiVersionColumn]: config.aiVersionValue,
      ...derivedFromAi,
      ...headlineUpdate,
      is_complete: true,
      completed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq(config.derivedIdColumn, derivedEntryId);

  if (updateResult.error) {
    console.error(`${config.moduleName}: derived update failed`, updateResult.error.code);
    return { error: true };
  }
  return { error: false };
}
