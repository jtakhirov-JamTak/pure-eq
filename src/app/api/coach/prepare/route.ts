import { z } from "zod";
import { createPrepareSchema } from "@/lib/validation";
import { prepareOutputSchema } from "@/lib/ai/schemas";
import { buildPreparePrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

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
  threadBehavior: "auto_create",
  personDedup: "name_and_relationship",
  derivedTable: "prepare_entries",
  derivedIdColumn: "prepare_entry_id",
  aiJsonColumn: "ai_plan_json",
  aiVersionColumn: "ai_plan_version",
  aiVersionValue: 1,

  buildPayloadFields: (input) => ({
    personName: input.personName,
    relationship: input.relationship,
    situation: input.situation,
    desiredOutcome: input.desiredOutcome,
    primaryEmotion: input.primaryEmotion,
    defaultPattern: input.defaultPattern,
    otherPersonHypothesis: input.otherPersonHypothesis,
    realityCheckQuestion: input.realityCheckQuestion,
    triggerPlan: input.triggerPlan,
  }),

  buildDerivedInsert: (input) => ({
    situation_text: input.situation,
    desired_outcome: input.desiredOutcome,
    primary_value: input.primaryEmotion,
  }),

  buildPrompt: (input, profile) =>
    buildPreparePrompt({
      profile,
      personName: input.personName,
      relationship: input.relationship,
      situation: input.situation,
      desiredOutcome: input.desiredOutcome,
      primaryEmotion: input.primaryEmotion,
      defaultPattern: input.defaultPattern,
      otherPersonHypothesis: input.otherPersonHypothesis,
      realityCheckQuestion: input.realityCheckQuestion,
      triggerPlan: input.triggerPlan,
    }),

  observationConfidence: 0.5,
  observationSource: "predictive",
  extractorVersion: "prepare_v1",

  buildSupportingEvidence: (aiOutput) => ({
    likely_blind_spot: aiOutput.likely_blind_spot,
    what_user_may_be_missing: aiOutput.what_user_may_be_missing,
  }),

  buildResponseExtras: () => ({}),

  getThreadTitle: (input) => {
    const truncated = input.situation.slice(0, 80).replace(/\s+\S*$/, "");
    return truncated || input.situation.slice(0, 80);
  },

  freeUsageField: "freePrepareUsed",
};

export async function POST(req: Request) {
  return runCoachModule(req, config);
}
