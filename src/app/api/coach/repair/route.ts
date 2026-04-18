import { z } from "zod";
import { createRepairSchema } from "@/lib/validation";
import { repairOutputSchema } from "@/lib/ai/schemas";
import { buildRepairPrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

const requestSchema = createRepairSchema.extend({
  idempotencyKey: z.string().uuid(),
  personName: z.string().trim().max(200).optional(),
});

type Input = z.infer<typeof createRepairSchema>;
type AiOutput = z.infer<typeof repairOutputSchema>;

const config: CoachModuleConfig<Input, AiOutput> = {
  moduleName: "repair",
  requestSchema,
  aiOutputSchema: repairOutputSchema,
  subscriptionGate: "required",
  threadBehavior: "auto_link",
  personDedup: "name_only",
  derivedTable: "repair_entries",
  derivedIdColumn: "repair_entry_id",
  aiJsonColumn: "ai_strategy_json",
  aiVersionColumn: "ai_strategy_version",
  aiVersionValue: 2,

  buildPayloadFields: (input) => ({
    whatNeedsRepair: input.whatNeedsRepair,
    yourResponsibility: input.yourResponsibility,
    theirNeed: input.theirNeed,
    desiredOutcome: input.desiredOutcome,
    channel: input.channel,
    timing: input.timing,
  }),

  buildDerivedInsert: (input) => ({
    what_needs_repair: input.whatNeedsRepair,
    your_responsibility: input.yourResponsibility,
    their_need: input.theirNeed,
    desired_outcome: input.desiredOutcome,
    channel: input.channel,
    timing: input.timing,
  }),

  buildPrompt: (input, profile) =>
    buildRepairPrompt({
      profile,
      whatNeedsRepair: input.whatNeedsRepair,
      yourResponsibility: input.yourResponsibility,
      theirNeed: input.theirNeed,
      desiredOutcome: input.desiredOutcome,
      channel: input.channel,
      timing: input.timing,
    }),

  observationConfidence: 0.8,
  observationSource: "observed",
  extractorVersion: "repair_v1",

  buildSupportingEvidence: (aiOutput, input) => ({
    repair_strategy: aiOutput.repair_strategy,
    desired_outcome: input.desiredOutcome,
  }),

  buildResponseExtras: (derivedEntryId) => ({
    repairEntryId: derivedEntryId,
  }),
};

export async function POST(req: Request) {
  return runCoachModule(req, config);
}
