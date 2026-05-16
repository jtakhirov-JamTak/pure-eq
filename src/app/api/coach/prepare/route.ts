import { z } from "zod";
import { createPrepareSchema } from "@/lib/validation";
import { prepareOutputSchema } from "@/lib/ai/schemas";
import { buildPreparePrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

// ============================================================
// Prepare — single 14-field SOT flow (Coach SOT 2026-05-06)
// ============================================================
// Path A/B split is gone — Pulse Check is now its own module. Old fields
// (situation_text/primary_value/their_need/etc.) stay nullable in the DB
// for /history reads on legacy rows; new posts do not write them.

const requestSchema = createPrepareSchema.extend({
  idempotencyKey: z.string().uuid(),
});

type Input = z.infer<typeof createPrepareSchema>;
type AiOutput = z.infer<typeof prepareOutputSchema>;

const config: CoachModuleConfig<Input, AiOutput> = {
  moduleName: "prepare",
  requestSchema,
  aiOutputSchema: prepareOutputSchema,
  subscriptionGate: "free_one",
  freeUsageField: "freePrepareUsed",
  personBehavior: "resolve",
  personDedup: "name_and_relationship",
  threadBehavior: "auto_create",
  derivedTable: "prepare_entries",
  derivedIdColumn: "prepare_entry_id",
  aiJsonColumn: "ai_plan_json",
  aiVersionColumn: "ai_plan_version",
  // 2026-05-08 Commit 4: bump 7 → 8 alongside PROMPT_VERSION 5.0.0 → 5.1.0
  // and the SOT follow-up migration 0037 (primary_emotion + default_pattern
  // + neutral_check_question, body chip moves off opener onto primary
  // emotion semantically). Distinguishes SOT-follow-up rows from
  // 0036-shape rows (aiVersionValue 7, path = "sot").
  aiVersionValue: 8,

  // SOT 2026-05-08 Commit 4: aiVersionValue 7 → 8 alongside the SOT
  // follow-up. New fields (primary_emotion, default_pattern,
  // neutral_check_question) enter buildPreparePrompt; the body chip moves
  // off the opener onto primary_emotion semantically (column stays as
  // body_location — re-purposed consumer per 0037).
  buildPayloadFields: (input) => ({
    personName: input.personName,
    relationship: input.relationship,
    situation: input.situation,
    primaryEmotion: input.primaryEmotion,
    bodyLocation: input.bodyLocation,
    emotionAsData: input.emotionAsData,
    defaultPattern: input.defaultPattern,
    observedFromThem: input.observedFromThem,
    theirStateHedged: input.theirStateHedged,
    fairestVersion: input.fairestVersion,
    predictedReaction: input.predictedReaction,
    hiddenExpectation: input.hiddenExpectation,
    specificShift: input.specificShift,
    outcomeFloor: input.outcomeFloor,
    neutralCheckQuestion: input.neutralCheckQuestion,
    opener: input.opener,
    triggerPlan: input.triggerPlan,
  }),

  buildDerivedInsert: (input) => ({
    // Keep `path` set to a non-null sentinel so legacy /history readers
    // that filter by path don't drop new rows. SOT-follow-up rows write
    // path = "sot_v2" to distinguish from path = "sot" (0036 shape, pre-
    // primary_emotion / default_pattern / neutral_check_question).
    path: "sot_v2",
    situation_text: input.situation,
    primary_emotion: input.primaryEmotion,
    body_location: input.bodyLocation,
    emotion_as_data: input.emotionAsData,
    default_pattern: input.defaultPattern,
    observed_from_them: input.observedFromThem,
    their_state_hedged: input.theirStateHedged,
    fairest_version: input.fairestVersion,
    predicted_reaction: input.predictedReaction,
    hidden_expectation: input.hiddenExpectation,
    specific_shift: input.specificShift,
    outcome_floor: input.outcomeFloor,
    neutral_check_question: input.neutralCheckQuestion,
    opener: input.opener,
  }),

  buildPrompt: (input, profile) =>
    buildPreparePrompt({
      profile,
      personName: input.personName,
      relationship: input.relationship,
      situation: input.situation,
      primaryEmotion: input.primaryEmotion,
      bodyLocation: input.bodyLocation,
      emotionAsData: input.emotionAsData,
      defaultPattern: input.defaultPattern,
      observedFromThem: input.observedFromThem,
      theirStateHedged: input.theirStateHedged,
      fairestVersion: input.fairestVersion,
      predictedReaction: input.predictedReaction,
      hiddenExpectation: input.hiddenExpectation,
      specificShift: input.specificShift,
      outcomeFloor: input.outcomeFloor,
      neutralCheckQuestion: input.neutralCheckQuestion,
      opener: input.opener,
      triggerPlan: input.triggerPlan,
    }),

  buildResponseExtras: () => ({}),

  getThreadTitle: (input) => {
    const truncated = input.situation.slice(0, 80).replace(/\s+\S*$/, "");
    return truncated || input.situation.slice(0, 80);
  },
};

export async function POST(req: Request) {
  return runCoachModule(req, config);
}
