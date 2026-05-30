// Pure EQ — Pulse Check ("Something feels off") module.
//
// Pulse Check is its own module with its own derived table
// (pulse_check_entries) and its own free-use flag (freePulseCheckUsed).
// Same shared runner as Prepare/Review/BYS — only the per-module
// CoachModuleConfig differs.
//
// ============================================================
// Lean redesign (coins redesign 2026-05-29, Slice C1)
// ============================================================
// The lean form sends 6 fields + 2 conditional + a Quick/Deep tier. The old
// 10-field worksheet is gone. Removed inputs (relationship, whenItShifted,
// feelingAndBody, theirsNotAboutYou) keep their columns nullable for legacy
// /history reads; new posts do not write them. The single-sided
// signalNoiseObservation becomes the two-sided signal_test_confirm /
// signal_test_disconfirm. The legacy next_move_chip taxonomy is replaced by the
// leaner next_move column (new CHECK in migration 0042). relationship is now
// resolved server-side from the person row (personDedup: "name_only"), like
// lean Review, and fed into the prompt via buildPrompt's context arg.
//
// Field flattening: createPulseCheckSchema groups storyAndAlternative as a
// nested object; the DB schema uses flat columns. buildDerivedInsert flattens
// `.storyAndAlternative.story` → `story`, `.alternative` → `alternative`.

import { z } from "zod";
import { createPulseCheckSchema } from "@/lib/validation";
import { pulseCheckOutputSchema } from "@/lib/ai/schemas";
import { buildPulseCheckPrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

const requestSchema = createPulseCheckSchema.and(
  z.object({ idempotencyKey: z.string().uuid() }),
);

type Input = z.infer<typeof createPulseCheckSchema>;
type AiOutput = z.infer<typeof pulseCheckOutputSchema>;

// Exported so vitest round-trip tests can call buildDerivedInsert /
// buildPayloadFields directly and catch column-rename drift the schema-only
// tests miss (same pattern as reviewModuleConfig).
export const pulseCheckModuleConfig: CoachModuleConfig<Input, AiOutput> = {
  moduleName: "pulse_check",
  requestSchema: requestSchema as unknown as CoachModuleConfig<
    Input,
    AiOutput
  >["requestSchema"],
  aiOutputSchema: pulseCheckOutputSchema,
  subscriptionGate: "free_one",
  freeUsageField: "freePulseCheckUsed",
  personBehavior: "resolve",
  // Lean form dropped the relationship step; dedupe by name only and resolve
  // relationship from the person row server-side (mirrors lean Review).
  personDedup: "name_only",
  threadBehavior: "auto_create",
  derivedTable: "pulse_check_entries",
  derivedIdColumn: "pulse_check_entry_id",
  aiJsonColumn: "ai_output_json",
  aiVersionColumn: "ai_output_version",
  // Coins redesign Slice C1 2026-05-29: bump 1 → 2. The lean form drops 4 inputs,
  // splits the signal test into two columns, realigns the next-move taxonomy, and
  // the AI output shape changes from the 5-field {real_issue,
  // reality_check_question, thing_not_to_do, they_might_need, best_next_move} set
  // to the tier-aware {signal_vs_noise, non_you_explanation, next_move_card
  // (+ stop_checking_rule, pattern_projection_risk on Deep)} set. Readers MUST
  // gate on ai_output_version when distinguishing shape — 2 = lean tiered,
  // 1/NULL = legacy single-tier.
  aiVersionValue: 2,

  buildPayloadFields: (input) => ({
    tier: input.tier,
    personName: input.personName,
    whatFeelsOff: input.whatFeelsOff,
    whatChangedVsBefore: input.whatChangedVsBefore,
    story: input.storyAndAlternative.story,
    alternative: input.storyAndAlternative.alternative,
    signalTestConfirm: input.signalTestConfirm,
    signalTestDisconfirm: input.signalTestDisconfirm,
    nextMove: input.nextMove,
    checkWindow: input.checkWindow ?? null,
    lightCheckQuestion: input.lightCheckQuestion ?? null,
  }),

  buildDerivedInsert: (input) => ({
    // whatChangedVsBefore reuses the existing what_changed_and_before column
    // (same semantic, renamed in the lean form).
    what_feels_off: input.whatFeelsOff,
    what_changed_and_before: input.whatChangedVsBefore,
    story: input.storyAndAlternative.story,
    alternative: input.storyAndAlternative.alternative,
    signal_test_confirm: input.signalTestConfirm,
    signal_test_disconfirm: input.signalTestDisconfirm,
    next_move: input.nextMove,
    check_window: input.checkWindow ?? null,
    light_check_question: input.lightCheckQuestion ?? null,
    ai_tier: input.tier,
    // Deprecated-in-place columns the lean form no longer writes. Explicit null
    // on the two superseded by new columns; ai_output_version (2) is the
    // authoritative shape selector. Other dropped inputs (when_it_shifted,
    // feeling_text, body_location, theirs_not_about_you) default null on insert.
    signal_noise_observation: null,
    next_move_chip: null,
  }),

  buildPrompt: (input, profile, context) =>
    buildPulseCheckPrompt({
      profile,
      tier: input.tier,
      personName: context.personName,
      personRelationship: context.personRelationship,
      whatFeelsOff: input.whatFeelsOff,
      whatChangedVsBefore: input.whatChangedVsBefore,
      story: input.storyAndAlternative.story,
      alternative: input.storyAndAlternative.alternative,
      signalTestConfirm: input.signalTestConfirm,
      signalTestDisconfirm: input.signalTestDisconfirm,
      nextMove: input.nextMove,
      checkWindow: input.checkWindow ?? null,
      lightCheckQuestion: input.lightCheckQuestion ?? null,
    }),

  // Surface the derived pulse_check_entry_id so the result screen can attach
  // Accept/Edit/Not-true card edits (POST /api/coach/card-edit) to it.
  buildResponseExtras: (derivedEntryId) => ({
    pulseCheckEntryId: derivedEntryId,
  }),

  getThreadTitle: (input) => {
    const truncated = input.whatFeelsOff.slice(0, 80).replace(/\s+\S*$/, "");
    return truncated || input.whatFeelsOff.slice(0, 80);
  },
};

export async function POST(req: Request) {
  return runCoachModule(req, pulseCheckModuleConfig);
}
