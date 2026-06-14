import { z } from "zod";
import { createPrepareSchema } from "@/lib/validation";
import { prepareOutputSchema } from "@/lib/ai/schemas";
import { buildPreparePrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

// ============================================================
// Prepare — 10-screen flow, tier-aware cards (redesign 2026-06-13)
// ============================================================
// The form sends 11 inputs across 10 screens + a Quick/Deep tier:
//   personName, relationship, conversationTypePrimary (+ optional
//   conversationTypeSecondary), situation, feelingAndWhy, myPattern,
//   fairestVersion, theirFeelingWant, hiddenAskAndFloor, opener, triggerPlan.
// New columns (migration 0053): conversation_type_primary/_secondary,
// feeling_and_why, my_pattern, their_feeling_want. The prior conversation_move
// chip and the older SOT inputs keep their columns nullable for legacy export
// reads; new posts do not write them.
//
// OUTPUT redesign 2026-06-14 (ai_plan_version 9 → 10): Quick emits 6 framing
// cards; Deep adds back the original 5. The mode card's AI classification
// OVERWRITES conversation_type_primary/_secondary (via extractDerivedFromAi) —
// the AI is the source of truth for the stored type, the user's screen-3 pick
// is only seeded then corrected. predicted_reaction is now a Deep-only card, so
// only Deep Prepares feed the Review calibration column. INPUTS are unchanged,
// so path stays 'lean_v2' and no migration is needed (all 6 new cards live in
// ai_plan_json; the columns they touch already exist).

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
  headlineColumn: "ai_headline",
  aiVersionColumn: "ai_plan_version",
  // Output redesign 2026-06-14: bump 9 → 10. Quick now emits 6 framing cards
  // {conversation_mode (+ classified_primary/_secondary), hot_layer, goal_gap,
  // posture, do_dont, carry_in}; the original 5 cards (pressure_check,
  // cleaner_opener, predicted_reaction, neutral_check_question, deeper_read)
  // moved to Deep only. Readers MUST gate on ai_plan_version when distinguishing
  // shape — 10 = framing+original-5, 9 = lean tiered (original 3+2), 8 = SOT.
  aiVersionValue: 10,

  buildPayloadFields: (input) => ({
    tier: input.tier,
    personName: input.personName,
    relationship: input.relationship,
    conversationTypePrimary: input.conversationTypePrimary,
    // null (not undefined) when omitted — keep raw + derived layers consistent.
    conversationTypeSecondary: input.conversationTypeSecondary ?? null,
    situation: input.situation,
    feelingAndWhy: input.feelingAndWhy,
    myPattern: input.myPattern,
    fairestVersion: input.fairestVersion,
    theirFeelingWant: input.theirFeelingWant,
    hiddenAskAndFloor: input.hiddenAskAndFloor,
    opener: input.opener,
    triggerPlan: input.triggerPlan,
  }),

  buildDerivedInsert: (input) => ({
    // `path` is the legacy filter-by-path discriminator; ai_plan_version
    // (aiVersionValue 9) stays the authoritative OUTPUT-shape selector (the
    // cards aren't changing this round). 'lean_v2' marks the redesigned INPUT
    // shape so export/legacy queries can still distinguish eras.
    path: "lean_v2",
    situation_text: input.situation,
    conversation_type_primary: input.conversationTypePrimary,
    conversation_type_secondary: input.conversationTypeSecondary ?? null,
    feeling_and_why: input.feelingAndWhy,
    my_pattern: input.myPattern,
    fairest_version: input.fairestVersion,
    their_feeling_want: input.theirFeelingWant,
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
      conversationTypePrimary: input.conversationTypePrimary,
      conversationTypeSecondary: input.conversationTypeSecondary ?? null,
      situation: input.situation,
      feelingAndWhy: input.feelingAndWhy,
      myPattern: input.myPattern,
      fairestVersion: input.fairestVersion,
      theirFeelingWant: input.theirFeelingWant,
      hiddenAskAndFloor: input.hiddenAskAndFloor,
      opener: input.opener,
      triggerPlan: input.triggerPlan,
    }),

  // On normal output: (1) overwrite the conversation_type columns with the
  // AI's classification — the AI is the source of truth for the type post-
  // redesign (founder decision 2026-06-14), so the user's screen-3 pick (seeded
  // in buildDerivedInsert) is corrected here; (2) promote the Deep Predicted
  // Reaction card into predicted_reaction so the Review calibration link
  // (calibration.ts reads predicted_reaction) keeps working. predicted_reaction
  // is Deep-only now, so Quick leaves the column at its null insert value.
  // Refusal mode keeps the user's pick (returns nothing).
  extractDerivedFromAi: (aiOutput) => {
    if (aiOutput.mode !== "normal") return {};
    const secondary =
      aiOutput.classified_secondary &&
      aiOutput.classified_secondary !== aiOutput.classified_primary
        ? aiOutput.classified_secondary
        : null;
    return {
      conversation_type_primary: aiOutput.classified_primary,
      conversation_type_secondary: secondary,
      // undefined on Quick → omit so the UPDATE doesn't null a populated column.
      ...(aiOutput.predicted_reaction
        ? { predicted_reaction: aiOutput.predicted_reaction }
        : {}),
    };
  },

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
