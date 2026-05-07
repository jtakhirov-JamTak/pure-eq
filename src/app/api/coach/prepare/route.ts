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
  // 2026-05-07: bump 6 → 7 alongside PROMPT_VERSION 4.5.0 → 5.0.0 and
  // the Prepare SOT migration (10 new columns, Path A/B collapse, opener
  // self-check rule). Distinguishes post-SOT rows from legacy 6-rows.
  aiVersionValue: 7,

  buildPayloadFields: (input) => ({
    personName: input.personName,
    relationship: input.relationship,
    situation: input.situation,
    emotionAsData: input.emotionAsData,
    observedFromThem: input.observedFromThem,
    theirStateHedged: input.theirStateHedged,
    fairestVersion: input.fairestVersion,
    predictedReaction: input.predictedReaction,
    hiddenExpectation: input.hiddenExpectation,
    specificShift: input.specificShift,
    outcomeFloor: input.outcomeFloor,
    opener: input.opener,
    bodyLocation: input.bodyLocation,
    triggerPlan: input.triggerPlan,
  }),

  buildDerivedInsert: (input) => ({
    // Keep `path` set to a non-null sentinel so legacy /history readers
    // that filter by path don't drop new rows. New rows write
    // path = "sot" so they're distinguishable from legacy path_a/path_b.
    path: "sot",
    situation_text: input.situation,
    emotion_as_data: input.emotionAsData,
    observed_from_them: input.observedFromThem,
    their_state_hedged: input.theirStateHedged,
    fairest_version: input.fairestVersion,
    predicted_reaction: input.predictedReaction,
    hidden_expectation: input.hiddenExpectation,
    specific_shift: input.specificShift,
    outcome_floor: input.outcomeFloor,
    opener: input.opener,
    body_location: input.bodyLocation,
  }),

  buildPrompt: (input, profile) =>
    buildPreparePrompt({
      profile,
      personName: input.personName,
      relationship: input.relationship,
      situation: input.situation,
      emotionAsData: input.emotionAsData,
      observedFromThem: input.observedFromThem,
      theirStateHedged: input.theirStateHedged,
      fairestVersion: input.fairestVersion,
      predictedReaction: input.predictedReaction,
      hiddenExpectation: input.hiddenExpectation,
      specificShift: input.specificShift,
      outcomeFloor: input.outcomeFloor,
      opener: input.opener,
      bodyLocation: input.bodyLocation,
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
