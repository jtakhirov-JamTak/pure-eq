import { z } from "zod";
import { createPrepareSchema } from "@/lib/validation";
import { prepareOutputSchema } from "@/lib/ai/schemas";
import { buildPreparePrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

// ============================================================
// Prepare — lean 8-field flow, tier-aware cards (coins redesign 2026-05-29)
// ============================================================
// The lean form sends 8 fields + a Quick/Deep tier. Removed SOT inputs
// (primary_emotion, emotion_as_data, default_pattern, observed_from_them,
// their_state_hedged, specific_shift, hidden_expectation, outcome_floor,
// neutral_check_question, body_location) keep their columns nullable for
// legacy /history reads; new posts do not write them. predicted_reaction is
// no longer a user input — it is now written from the AI Quick "Predicted
// Reaction" card via extractDerivedFromAi, so calibration.ts is unchanged.
// hidden_expectation + outcome_floor are merged into hidden_ask_and_floor;
// conversation_move is the new routing chip.

const requestSchema = createPrepareSchema.extend({
  idempotencyKey: z.string().uuid(),
  // Slice B coins: false = free Save; true = paid Get-AI-feedback (default true
  // in run-module for combined-submit back-compat).
  generateAi: z.boolean().optional(),
});

type Input = z.infer<typeof createPrepareSchema>;
type AiOutput = z.infer<typeof prepareOutputSchema>;

// Exported (SOT 2026-05-08 fix6, #14) so vitest round-trip tests can
// directly call buildDerivedInsert / buildPayloadFields and catch column-
// rename drift the schema-only tests miss.
export const prepareModuleConfig: CoachModuleConfig<Input, AiOutput> = {
  moduleName: "prepare",
  requestSchema,
  aiOutputSchema: prepareOutputSchema,
  personBehavior: "resolve",
  personDedup: "name_and_relationship",
  threadBehavior: "auto_create",
  derivedTable: "prepare_entries",
  derivedIdColumn: "prepare_entry_id",
  aiJsonColumn: "ai_plan_json",
  aiVersionColumn: "ai_plan_version",
  // Coins redesign Slice A 2026-05-29: bump 8 → 9. The lean form drops most
  // SOT inputs and the AI output shape changes from the fixed 5-card set to
  // the tier-aware {pressure_check, cleaner_opener, predicted_reaction
  // (+ neutral_check_question, deeper_read on Deep)} set. Readers MUST gate
  // on ai_plan_version when distinguishing shape — 9 = lean tiered, 8 = SOT
  // follow-up, ≤7 = older.
  aiVersionValue: 9,

  buildPayloadFields: (input) => ({
    tier: input.tier,
    personName: input.personName,
    relationship: input.relationship,
    conversationMove: input.conversationMove,
    situation: input.situation,
    fairestVersion: input.fairestVersion,
    hiddenAskAndFloor: input.hiddenAskAndFloor,
    opener: input.opener,
    triggerPlan: input.triggerPlan,
  }),

  buildDerivedInsert: (input) => ({
    // `path` is the legacy discriminator kept for /history readers and
    // export.ts row labels. ai_plan_version (aiVersionValue 9) is the
    // authoritative shape selector — readers gate on it, not on `path`.
    // We still write a non-null value so legacy filter-by-path queries
    // don't drop new rows.
    path: "lean_v1",
    situation_text: input.situation,
    conversation_move: input.conversationMove,
    fairest_version: input.fairestVersion,
    hidden_ask_and_floor: input.hiddenAskAndFloor,
    opener: input.opener,
    trigger_plan: input.triggerPlan,
    ai_tier: input.tier,
    // Filled from the AI Predicted Reaction card on the step-13 update
    // (extractDerivedFromAi). Null at insert time.
    predicted_reaction: null,
  }),

  buildPrompt: (input, profile) =>
    buildPreparePrompt({
      profile,
      tier: input.tier,
      personName: input.personName,
      relationship: input.relationship,
      conversationMove: input.conversationMove,
      situation: input.situation,
      fairestVersion: input.fairestVersion,
      hiddenAskAndFloor: input.hiddenAskAndFloor,
      opener: input.opener,
      triggerPlan: input.triggerPlan,
    }),

  // Promote the AI Predicted Reaction card into predicted_reaction so the
  // Review calibration link (calibration.ts reads predicted_reaction) keeps
  // working — only the writer moved from a user input to this AI card.
  // Refusal mode has no cards, so write nothing.
  extractDerivedFromAi: (aiOutput) =>
    aiOutput.mode === "normal"
      ? { predicted_reaction: aiOutput.predicted_reaction }
      : {},

  // Surface the derived prepare_entry_id so the result screen can attach
  // Accept/Edit/Not-true card edits (POST /api/coach/card-edit) to it.
  buildResponseExtras: (derivedEntryId) => ({ prepareEntryId: derivedEntryId }),

  getThreadTitle: (input) => {
    const truncated = input.situation.slice(0, 80).replace(/\s+\S*$/, "");
    return truncated || input.situation.slice(0, 80);
  },
};

export async function POST(req: Request) {
  return runCoachModule(req, prepareModuleConfig);
}
