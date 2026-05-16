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
  // 2026-05-08 Commit 5: bump 8 → 9 alongside PROMPT_VERSION 5.0.0 → 5.1.0
  // and the Review Full SOT overhaul (8 new Qs on Full, lessonScreen 3-
  // field, shared Page-5 head/tail, deprecated-Q removal, repair-branch
  // wording fix). Distinguishes Commit-5 rows from 0036-shape rows
  // (aiVersionValue 8). felt_at_hardest_moment + body_location +
  // feeling_tracking + easier_or_harder + treat_as_data +
  // something_that_helped + signs_how_they_left + turning_point +
  // what_else_explains + what_read_missed + lesson_about_them /
  // lesson_about_self / lesson_differently now persist on Full.
  aiVersionValue: 9,

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
    // SOT 2026-05-08 Commit 5: Full self-state + impact + theirs Qs.
    feltAtHardestMoment: input.feltAtHardestMoment ?? null,
    bodyLocation: input.bodyLocation ?? null,
    feelingTracking: input.feelingTracking ?? null,
    whatYouDid: input.whatYouDid ?? null,
    easierOrHarder: input.easierOrHarder ?? null,
    treatAsData: input.treatAsData ?? null,
    somethingThatHelped: input.somethingThatHelped ?? null,
    theirInMomentExperience: input.theirInMomentExperience ?? null,
    signsHowTheyLeft: input.signsHowTheyLeft ?? null,
    turningPoint: input.turningPoint ?? null,
    // Deprecated Full fields no longer collected — historical rows keep
    // these populated. New posts write null.
    hardestMomentFeeling: input.hardestMomentFeeling ?? null,
    observedInThem: input.observedInThem ?? null,
    whatYouAvoided: input.whatYouAvoided ?? null,
    askBeforeUnderstanding: input.askBeforeUnderstanding ?? null,
    needsToHappenNext: input.needsToHappenNext ?? null,
    forecast: input.forecast ?? null,
    repairBranchActive: input.repairBranchActive,
    impactToName: input.impactToName ?? null,
    theirNeedFirst: input.theirNeedFirst ?? null,
    pressureVsCare: input.pressureVsCare ?? null,
    timingWhen: input.timingWhen ?? null,
    timingNow: input.timingNow ?? null,
    firstRepairSentence: input.firstRepairSentence ?? null,
    yourPart: input.yourPart ?? null,
    linkedPrepareEntryId: input.linkedPrepareEntryId ?? null,
    calibrationBlock: input.calibrationBlock ?? null,
    whatProtecting: input.whatProtecting ?? null,
    lessonScreen: input.lessonScreen ?? null,
    whatElseExplains: input.whatElseExplains ?? null,
    whatReadMissed: input.whatReadMissed ?? null,
  }),

  buildDerivedInsert: (input) => {
    // SOT 2026-05-08 Commit 5: new SOT Qs land in their dedicated columns
    // (most already added in 0036; felt_at_hardest_moment added in 0037).
    // theirInMomentExperience writes to the existing `their_experience`
    // column — 0037's comment revision documents the un-deprecation.
    // lessonScreen.a/b/c split across lesson_about_them /
    // lesson_about_self / lesson_differently (all in 0036).
    const insert: Record<string, unknown> = {
      review_depth: input.reviewDepth,
      what_happened: input.whatHappened,
      observed_raw: input.observedRaw,
      interpreted_raw: input.interpretedRaw,
      felt_at_hardest_moment: input.feltAtHardestMoment ?? null,
      body_location: input.bodyLocation ?? null,
      feeling_tracking: input.feelingTracking ?? null,
      what_you_did: input.whatYouDid ?? null,
      easier_or_harder: input.easierOrHarder ?? null,
      treat_as_data: input.treatAsData ?? null,
      something_that_helped: input.somethingThatHelped ?? null,
      their_experience: input.theirInMomentExperience ?? null,
      signs_how_they_left: input.signsHowTheyLeft ?? null,
      turning_point: input.turningPoint ?? null,
      // Deprecated Full fields — historical rows keep their values; new
      // posts write null. Columns stay for /history reads on legacy rows.
      hardest_moment_feeling: input.hardestMomentFeeling ?? null,
      observed_in_them: input.observedInThem ?? null,
      what_you_avoided: input.whatYouAvoided ?? null,
      ask_before_understanding: input.askBeforeUnderstanding ?? null,
      needs_to_happen_next: input.needsToHappenNext ?? null,
      forecast: input.forecast ?? null,
      repair_branch_active: input.repairBranchActive,
      // SOT 2026-05-08 fix1: 5-Q repair swap (impactToName, theirNeedFirst,
      // pressureVsCare, timingWhen, timingNow, firstRepairSentence). DB
      // columns added in 0036; without this insert, every Repair submission
      // landed only `repair_branch_active = true` and discarded the rest.
      impact_to_name: input.impactToName ?? null,
      their_need_first: input.theirNeedFirst ?? null,
      pressure_vs_care: input.pressureVsCare ?? null,
      timing_when: input.timingWhen ?? null,
      timing_now: input.timingNow ?? null,
      first_repair_sentence: input.firstRepairSentence ?? null,
      your_part: input.yourPart ?? null,
      linked_prepare_entry_id: input.linkedPrepareEntryId ?? null,
      calibration_block: input.calibrationBlock ?? null,
      what_protecting: input.whatProtecting?.chip ?? null,
      what_protecting_text: input.whatProtecting?.text ?? null,
      lesson_about_them: input.lessonScreen?.a ?? null,
      lesson_about_self: input.lessonScreen?.b ?? null,
      lesson_differently: input.lessonScreen?.c ?? null,
      what_else_explains: input.whatElseExplains ?? null,
      what_read_missed: input.whatReadMissed ?? null,
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
      // SOT 2026-05-08 Commit 5 — new SOT inputs.
      feltAtHardestMoment: input.feltAtHardestMoment ?? null,
      bodyLocation: input.bodyLocation ?? null,
      feelingTracking: input.feelingTracking ?? null,
      easierOrHarder: input.easierOrHarder ?? null,
      treatAsData: input.treatAsData ?? null,
      somethingThatHelped: input.somethingThatHelped ?? null,
      theirInMomentExperience: input.theirInMomentExperience ?? null,
      signsHowTheyLeft: input.signsHowTheyLeft ?? null,
      turningPoint: input.turningPoint ?? null,
      whatElseExplains: input.whatElseExplains ?? null,
      whatReadMissed: input.whatReadMissed ?? null,
      lessonScreen: input.lessonScreen ?? null,
      whatYouDid: input.whatYouDid,
      observedInThem: input.observedInThem,
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
