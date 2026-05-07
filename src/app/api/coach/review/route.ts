import { z } from "zod";
import { createReviewSchema } from "@/lib/validation";
import { reviewOutputSchema } from "@/lib/ai/schemas";
import { buildReviewPrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import { findLinkedPrepareEntry } from "@/lib/coach/calibration";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

const requestSchema = createReviewSchema.extend({
  idempotencyKey: z.string().uuid(),
  personName: z.string().max(200).optional(),
});

type Input = z.infer<typeof createReviewSchema> & {
  // Augmented by prePromptEnrich for Full reviews when the lookup hits.
  // The schema accepts linkedPrepareEntryId as nullable optional; the
  // server-side lookup is authoritative either way.
  prepareSnapshotForPrompt?: {
    situation: string | null;
    emotionAsData: string | null;
    predictedReaction: string | null;
    hiddenExpectation: string | null;
    specificShift: string | null;
    outcomeFloor: string | null;
    opener: string | null;
  };
};
type AiOutput = z.infer<typeof reviewOutputSchema>;

const config: CoachModuleConfig<Input, AiOutput> = {
  moduleName: "review",
  requestSchema:
    requestSchema as unknown as CoachModuleConfig<Input, AiOutput>["requestSchema"],
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
  // 2026-05-07: bump 7 → 8 alongside PROMPT_VERSION 4.5.0 → 5.0.0 and the
  // SOT migration. Distinguishes Quick/Full split + calibration prepend +
  // standalone branch + repair-swap (Commit 6) from pre-SOT 7-rows.
  aiVersionValue: 8,

  // Server-side authoritative lookup for the Prepare → Review link. Runs
  // for Full reviews only (Quick path skips calibration entirely). Failure
  // degrades to no-link → standalone branch shape; never fails the request.
  prePromptEnrich: async (input, supabase, userId, personId) => {
    if (input.reviewDepth !== "full") return input;
    if (!personId) return input;
    const snapshot = await findLinkedPrepareEntry(supabase, userId, personId);
    if (!snapshot) return input;
    return {
      ...input,
      linkedPrepareEntryId: snapshot.prepareEntryId,
      prepareSnapshotForPrompt: {
        situation: snapshot.situation,
        emotionAsData: snapshot.emotionAsData,
        predictedReaction: snapshot.predictedReaction,
        hiddenExpectation: snapshot.hiddenExpectation,
        specificShift: snapshot.specificShift,
        outcomeFloor: snapshot.outcomeFloor,
        opener: snapshot.opener,
      },
    };
  },

  buildPayloadFields: (input) => ({
    reviewDepth: input.reviewDepth,
    whatHappened: input.whatHappened,
    observedRaw: input.observedRaw,
    interpretedRaw: input.interpretedRaw,
    hardestMomentFeeling: input.hardestMomentFeeling,
    whatYouDid: input.whatYouDid ?? null,
    observedInThem: input.observedInThem ?? null,
    theirExperience: input.theirExperience ?? null,
    whatYouAvoided: input.whatYouAvoided ?? null,
    askBeforeUnderstanding: input.askBeforeUnderstanding ?? null,
    needsToHappenNext: input.needsToHappenNext ?? null,
    repairBranchActive: input.repairBranchActive,
    yourPart: input.yourPart ?? null,
    linkedPrepareEntryId: input.linkedPrepareEntryId ?? null,
    calibrationBlock: input.calibrationBlock ?? null,
    whatProtecting: input.whatProtecting ?? null,
    whatYouLearned: input.whatYouLearned ?? null,
  }),

  buildDerivedInsert: (input) => {
    // forecast lives on whatProtecting? No — forecast = optional companion
    // on needsToHappenNext (select_needs_with_forecast). The schema models
    // it as `forecast` future-field; here we pass through whatever the
    // client sent. Old field names retained for back-compat.
    const insert: Record<string, unknown> = {
      review_depth: input.reviewDepth,
      what_happened: input.whatHappened,
      observed_raw: input.observedRaw,
      interpreted_raw: input.interpretedRaw,
      hardest_moment_feeling: input.hardestMomentFeeling,
      what_you_did: input.whatYouDid ?? null,
      observed_in_them: input.observedInThem ?? null,
      their_experience: input.theirExperience ?? null,
      what_you_avoided: input.whatYouAvoided ?? null,
      ask_before_understanding: input.askBeforeUnderstanding ?? null,
      needs_to_happen_next: input.needsToHappenNext ?? null,
      repair_branch_active: input.repairBranchActive,
      your_part: input.yourPart ?? null,
      linked_prepare_entry_id: input.linkedPrepareEntryId ?? null,
      calibration_block: input.calibrationBlock ?? null,
      what_protecting: input.whatProtecting?.chip ?? null,
      what_protecting_text: input.whatProtecting?.text ?? null,
    };
    return insert;
  },

  buildPrompt: (input, profile, context) =>
    buildReviewPrompt({
      profile,
      personName: context.personName,
      personRelationship: context.personRelationship,
      reviewDepth: input.reviewDepth,
      whatHappened: input.whatHappened,
      observedRaw: input.observedRaw,
      interpretedRaw: input.interpretedRaw,
      hardestMomentFeeling: input.hardestMomentFeeling,
      whatYouDid: input.whatYouDid,
      observedInThem: input.observedInThem,
      theirExperience: input.theirExperience,
      whatYouAvoided: input.whatYouAvoided,
      askBeforeUnderstanding: input.askBeforeUnderstanding,
      needsToHappenNext: input.needsToHappenNext,
      repairBranchActive: input.repairBranchActive,
      yourPart: input.yourPart,
      linkedPrepareEntryId: input.linkedPrepareEntryId ?? null,
      prepareSnapshot: input.prepareSnapshotForPrompt ?? null,
      calibrationBlock: input.calibrationBlock ?? null,
      whatProtecting: input.whatProtecting ?? null,
    }),

  buildResponseExtras: (derivedEntryId) => ({
    reviewEntryId: derivedEntryId,
  }),
};

export async function POST(req: Request) {
  return runCoachModule(req, config);
}
