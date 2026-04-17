import { z } from "zod";
import { createReviewSchema } from "@/lib/validation";
import { reviewOutputSchema } from "@/lib/ai/schemas";
import { buildReviewPrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

const requestSchema = createReviewSchema.extend({
  idempotencyKey: z.string().uuid(),
  personName: z.string().max(200).optional(),
});

type Input = z.infer<typeof createReviewSchema>;
type AiOutput = z.infer<typeof reviewOutputSchema>;

const config: CoachModuleConfig<Input, AiOutput> = {
  moduleName: "review",
  requestSchema,
  aiOutputSchema: reviewOutputSchema,
  subscriptionGate: "free_one",
  freeUsageField: "freeReviewUsed",
  threadBehavior: "auto_link",
  personDedup: "name_only",
  derivedTable: "review_entries",
  derivedIdColumn: "review_entry_id",
  aiJsonColumn: "ai_reflection_json",
  aiVersionColumn: "ai_reflection_version",
  aiVersionValue: 1,

  buildPayloadFields: (input) => ({
    whatHappened: input.whatHappened,
    hardestMomentFeeling: input.hardestMomentFeeling,
    observedInThem: input.observedInThem,
    theirExperience: input.theirExperience,
    whatHelped: input.whatHelped,
    whatHurt: input.whatHurt,
    validatedAssumptions: input.validatedAssumptions ?? null,
    unresolvedAndNext: input.unresolvedAndNext,
  }),

  buildDerivedInsert: (input) => ({
    what_happened: input.whatHappened,
    hardest_moment_feeling: input.hardestMomentFeeling,
    observed_in_them: input.observedInThem,
    their_experience: input.theirExperience,
    what_helped: input.whatHelped,
    what_hurt: input.whatHurt,
    validated_assumptions: input.validatedAssumptions ?? null,
    unresolved_and_next: input.unresolvedAndNext,
  }),

  buildPrompt: (input, profile) =>
    buildReviewPrompt({
      profile,
      whatHappened: input.whatHappened,
      hardestMomentFeeling: input.hardestMomentFeeling,
      observedInThem: input.observedInThem,
      theirExperience: input.theirExperience,
      whatHelped: input.whatHelped,
      whatHurt: input.whatHurt,
      validatedAssumptions: input.validatedAssumptions ?? "",
      unresolvedAndNext: input.unresolvedAndNext,
    }),

  observationConfidence: 0.8,
  observationSource: "observed",
  extractorVersion: "review_v1",

  buildSupportingEvidence: (aiOutput) => ({
    how_user_likely_came_across: aiOutput.how_user_likely_came_across,
    where_projecting: aiOutput.where_projecting,
  }),

  buildResponseExtras: (derivedEntryId) => ({
    reviewEntryId: derivedEntryId,
  }),
};

export async function POST(req: Request) {
  return runCoachModule(req, config);
}
