import { z } from "zod";
import { createReviewSchema } from "@/lib/validation";
import { reviewOutputSchema } from "@/lib/ai/schemas";
import { buildReviewPrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import { findLinkedPrepareEntry } from "@/lib/coach/calibration";
import { deriveRepairBranchActive } from "@/lib/coach/page-flow";
import type { CoachModuleConfig } from "@/lib/coach/types";

// 2026-05-17 fix3 (#14): deriveRepairBranchActive lifted to page-flow.ts
// so client (review/page.tsx) and server (this file) share the predicate.
// The client uses it to decide whether to render the 3 Repair pages; the
// server re-runs it over the parsed payload to authoritative-stamp the
// `repair_branch_active` column and null repair fields if the derived
// value is false — never trusts the client-posted boolean.

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

// Exported (SOT 2026-05-08 fix6, #14) so vitest round-trip tests can
// directly call buildDerivedInsert / buildPayloadFields and catch column-
// rename drift the schema-only tests miss.
export const reviewModuleConfig: CoachModuleConfig<Input, AiOutput> = {
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
  //
  // 2026-05-17 fix3 (#10): force linkedPrepareEntryId to null whenever the
  // server-side lookup finds no snapshot. Without this, a client posting a
  // smuggled UUID (e.g. another user's Prepare row) would land that foreign
  // key in the DB FK column. RLS prevents reads of the foreign row, but the
  // FK reference itself leaks. We only ever trust UUIDs that came from
  // findLinkedPrepareEntry (which scopes by userId).
  prePromptEnrich: async (input, supabase, userId, personId) => {
    if (input.reviewDepth !== "full") {
      return { ...input, linkedPrepareEntryId: null };
    }
    if (!personId) return { ...input, linkedPrepareEntryId: null };
    const snapshot = await findLinkedPrepareEntry(supabase, userId, personId);
    if (!snapshot) return { ...input, linkedPrepareEntryId: null };
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

  buildPayloadFields: (input) => {
    const repairBranchActive = deriveRepairBranchActive(input);
    return ({
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
    // SOT 2026-05-08 fix2: server-derived, ignores client value.
    repairBranchActive,
    // Null-out repair fields when not in the repair branch so a buggy/
    // malicious client can't smuggle pre-canned repair content.
    impactToName: repairBranchActive ? input.impactToName ?? null : null,
    theirNeedFirst: repairBranchActive ? input.theirNeedFirst ?? null : null,
    pressureVsCare: repairBranchActive ? input.pressureVsCare ?? null : null,
    timingWhen: repairBranchActive ? input.timingWhen ?? null : null,
    timingNow: repairBranchActive ? input.timingNow ?? null : null,
    firstRepairSentence: repairBranchActive
      ? input.firstRepairSentence ?? null
      : null,
    yourPart: input.yourPart ?? null,
    linkedPrepareEntryId: input.linkedPrepareEntryId ?? null,
    calibrationBlock: input.calibrationBlock ?? null,
    whatProtecting: input.whatProtecting ?? null,
    lessonScreen: input.lessonScreen ?? null,
    whatElseExplains: input.whatElseExplains ?? null,
    whatReadMissed: input.whatReadMissed ?? null,
  });
  },

  buildDerivedInsert: (input) => {
    // SOT 2026-05-08 fix2: repair_branch_active is server-derived, NOT
    // taken from input.repairBranchActive. Repair-branch columns are
    // forced null when the derived value is false so a client cannot
    // smuggle repair content with a non-trigger chip.
    const repairBranchActive = deriveRepairBranchActive(input);
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
      their_in_moment_experience: input.theirInMomentExperience ?? null,
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
      repair_branch_active: repairBranchActive,
      // SOT 2026-05-08 fix1+fix2: 5-Q repair swap, gated on the server-
      // derived repairBranchActive so a client cannot persist repair
      // content with a non-trigger chip.
      impact_to_name: repairBranchActive ? input.impactToName ?? null : null,
      their_need_first: repairBranchActive
        ? input.theirNeedFirst ?? null
        : null,
      pressure_vs_care: repairBranchActive
        ? input.pressureVsCare ?? null
        : null,
      timing_when: repairBranchActive ? input.timingWhen ?? null : null,
      timing_now: repairBranchActive ? input.timingNow ?? null : null,
      first_repair_sentence: repairBranchActive
        ? input.firstRepairSentence ?? null
        : null,
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

  buildPrompt: (input, profile, context) => {
    const repairBranchActive = deriveRepairBranchActive(input);
    return buildReviewPrompt({
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
      repairBranchActive,
      yourPart: input.yourPart,
      linkedPrepareEntryId: input.linkedPrepareEntryId ?? null,
      prepareSnapshot: input.prepareSnapshotForPrompt ?? null,
      calibrationBlock: input.calibrationBlock ?? null,
      whatProtecting: input.whatProtecting ?? null,
    });
  },

  buildResponseExtras: (derivedEntryId) => ({
    reviewEntryId: derivedEntryId,
  }),
};

export async function POST(req: Request) {
  return runCoachModule(req, reviewModuleConfig);
}
