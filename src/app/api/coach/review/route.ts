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
  personBehavior: "resolve",
  personDedup: "name_only",
  threadBehavior: "auto_link",
  derivedTable: "review_entries",
  derivedIdColumn: "review_entry_id",
  aiJsonColumn: "ai_reflection_json",
  aiVersionColumn: "ai_reflection_version",
  aiVersionValue: 5,

  buildPayloadFields: (input) => ({
    whatHappened: input.whatHappened,
    hardestMomentFeeling: input.hardestMomentFeeling,
    whatYouDid: input.whatYouDid,
    observedInThem: input.observedInThem,
    theirExperience: input.theirExperience,
    whatYouAvoided: input.whatYouAvoided,
    askBeforeUnderstanding: input.askBeforeUnderstanding,
    needsToHappenNext: input.needsToHappenNext,
    repairBranchActive: input.repairBranchActive,
    yourPart: input.yourPart ?? null,
    secretWant: input.secretWant ?? null,
    couldMakeThemFeel: input.couldMakeThemFeel ?? null,
  }),

  buildDerivedInsert: (input) => ({
    what_happened: input.whatHappened,
    hardest_moment_feeling: input.hardestMomentFeeling,
    what_you_did: input.whatYouDid,
    observed_in_them: input.observedInThem,
    their_experience: input.theirExperience,
    what_you_avoided: input.whatYouAvoided,
    ask_before_understanding: input.askBeforeUnderstanding,
    needs_to_happen_next: input.needsToHappenNext,
    repair_branch_active: input.repairBranchActive,
    your_part: input.yourPart ?? null,
    secret_want: input.secretWant ?? null,
    could_make_them_feel: input.couldMakeThemFeel ?? null,
  }),

  buildPrompt: (input, profile) =>
    buildReviewPrompt({
      profile,
      whatHappened: input.whatHappened,
      hardestMomentFeeling: input.hardestMomentFeeling,
      whatYouDid: input.whatYouDid,
      observedInThem: input.observedInThem,
      theirExperience: input.theirExperience,
      whatYouAvoided: input.whatYouAvoided,
      askBeforeUnderstanding: input.askBeforeUnderstanding,
      needsToHappenNext: input.needsToHappenNext,
      repairBranchActive: input.repairBranchActive,
      yourPart: input.yourPart,
      secretWant: input.secretWant,
      couldMakeThemFeel: input.couldMakeThemFeel,
    }),

  buildResponseExtras: (derivedEntryId) => ({
    reviewEntryId: derivedEntryId,
  }),
};

export async function POST(req: Request) {
  return runCoachModule(req, config);
}
