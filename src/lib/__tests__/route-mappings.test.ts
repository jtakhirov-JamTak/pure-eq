// SOT 2026-05-08 fix6 (#14): round-trip tests on the coach route configs'
// buildDerivedInsert + buildPayloadFields. Schema-only tests catch shape
// validation drift but miss column-rename drift — if `feltAtHardestMoment
// → felt_at_hardest_moment` ever flips to a wrong column name, Zod still
// parses the post but the row lands in the wrong DB column and /history
// renders empty. These tests pin the mapping.

import { describe, it, expect } from "vitest";
import { reviewModuleConfig } from "@/app/api/coach/review/route";
import { prepareModuleConfig } from "@/app/api/coach/prepare/route";

// Helper types matching the parsed-input shapes the route configs expect.
type ReviewInput = Parameters<typeof reviewModuleConfig.buildDerivedInsert>[0];
type PrepareInput = Parameters<typeof prepareModuleConfig.buildDerivedInsert>[0];

const baseReviewInput: ReviewInput = {
  reviewDepth: "full",
  whatHappened: "We argued.",
  observedRaw: "they paused",
  interpretedRaw: "I read shutdown",
  feltAtHardestMoment: "pinned",
  bodyLocation: "chest",
  feelingTracking: "yes — already pulling back",
  whatYouDid: "kept pushing",
  easierOrHarder: "harder for them to circle back",
  treatAsData: "the never-mind was a real answer",
  somethingThatHelped: "nothing in the moment",
  theirInMomentExperience: "cornered",
  signsHowTheyLeft: "closed laptop",
  turningPoint: "when I said 'forget it'",
  needsToHappenNext: "apologize",
  forecast: "they'll go quiet by Friday",
  whatProtecting: { chip: "image", text: "didn't want to look reactive" },
  lessonScreen: { a: "push freezes", b: "ask first", c: null },
  whatElseExplains: null,
  whatReadMissed: null,
  impactToName: "they likely felt dismissed and stopped trying to explain",
  theirNeedFirst: "acknowledgment",
  pressureVsCare: "a follow-up DM tonight would tip into pressure",
  timingWhen: "tomorrow morning in person",
  timingNow: false,
  firstRepairSentence: "I think I cut you off twice — I'm sorry.",
  repairBranchActive: true,
} as ReviewInput;

const basePrepareInput: PrepareInput = {
  personName: "Alex",
  relationship: "partner",
  situation: "Chores split.",
  primaryEmotion: "resentment + dread",
  bodyLocation: "chest",
  emotionAsData: "pointing at unfairness",
  defaultPattern: "go quiet, then snap on the third time",
  observedFromThem: "sighs when I bring it up",
  theirStateHedged: "they might be empty",
  fairestVersion: "picking up overtime",
  predictedReaction: "they'll go quiet",
  hiddenExpectation: "they volunteer for dishes",
  specificShift: "standing rotation on calendar",
  outcomeFloor: "name that this keeps coming back",
  neutralCheckQuestion: "what's eating most of your bandwidth?",
  opener: "Hey, can we talk about how we split things?",
  triggerPlan: "If chest-tight, pause and ask one question.",
} as PrepareInput;

describe("reviewModuleConfig.buildDerivedInsert — SOT column mapping", () => {
  it("maps all 24+ new SOT fields to the right DB columns", () => {
    const insert = reviewModuleConfig.buildDerivedInsert(baseReviewInput) as Record<
      string,
      unknown
    >;

    expect(insert.review_depth).toBe("full");
    expect(insert.what_happened).toBe(baseReviewInput.whatHappened);
    expect(insert.observed_raw).toBe(baseReviewInput.observedRaw);
    expect(insert.interpreted_raw).toBe(baseReviewInput.interpretedRaw);
    expect(insert.felt_at_hardest_moment).toBe(
      baseReviewInput.feltAtHardestMoment,
    );
    expect(insert.body_location).toBe("chest");
    expect(insert.feeling_tracking).toBe(baseReviewInput.feelingTracking);
    expect(insert.what_you_did).toBe(baseReviewInput.whatYouDid);
    expect(insert.easier_or_harder).toBe(baseReviewInput.easierOrHarder);
    expect(insert.treat_as_data).toBe(baseReviewInput.treatAsData);
    expect(insert.something_that_helped).toBe(
      baseReviewInput.somethingThatHelped,
    );
    // SOT 2026-05-08 fix5 (#13): writes to the dedicated column, NOT the
    // deprecated their_experience.
    expect(insert.their_in_moment_experience).toBe(
      baseReviewInput.theirInMomentExperience,
    );
    expect(insert.signs_how_they_left).toBe(baseReviewInput.signsHowTheyLeft);
    expect(insert.turning_point).toBe(baseReviewInput.turningPoint);
    expect(insert.needs_to_happen_next).toBe("apologize");
    expect(insert.forecast).toBe(baseReviewInput.forecast);
    // whatProtecting splits across two columns.
    expect(insert.what_protecting).toBe("image");
    expect(insert.what_protecting_text).toBe("didn't want to look reactive");
    // lessonScreen splits across three columns.
    expect(insert.lesson_about_them).toBe("push freezes");
    expect(insert.lesson_about_self).toBe("ask first");
    expect(insert.lesson_differently).toBe(null);
    expect(insert.what_else_explains).toBe(null);
    expect(insert.what_read_missed).toBe(null);
  });

  it("persists ALL 6 SOT repair fields when the branch is active", () => {
    const insert = reviewModuleConfig.buildDerivedInsert(baseReviewInput) as Record<
      string,
      unknown
    >;
    expect(insert.repair_branch_active).toBe(true);
    expect(insert.impact_to_name).toBe(baseReviewInput.impactToName);
    expect(insert.their_need_first).toBe("acknowledgment");
    expect(insert.pressure_vs_care).toBe(baseReviewInput.pressureVsCare);
    expect(insert.timing_when).toBe(baseReviewInput.timingWhen);
    expect(insert.timing_now).toBe(false);
    expect(insert.first_repair_sentence).toBe(
      baseReviewInput.firstRepairSentence,
    );
  });

  it("server-derives repair_branch_active = false on non-trigger chip", () => {
    // SOT 2026-05-08 fix2 (#4): even if client smuggles repairBranchActive=true
    // and repair content, the server derivation gates persistence.
    const smuggled = {
      ...baseReviewInput,
      needsToHappenNext: "set_boundary" as const,
      repairBranchActive: true,
    } as ReviewInput;
    const insert = reviewModuleConfig.buildDerivedInsert(smuggled) as Record<
      string,
      unknown
    >;
    expect(insert.repair_branch_active).toBe(false);
    expect(insert.impact_to_name).toBe(null);
    expect(insert.their_need_first).toBe(null);
    expect(insert.pressure_vs_care).toBe(null);
    expect(insert.timing_when).toBe(null);
    expect(insert.timing_now).toBe(null);
    expect(insert.first_repair_sentence).toBe(null);
  });

  it("server-derives repair_branch_active = false on Quick depth even with trigger chip", () => {
    const quickWithTrigger = {
      ...baseReviewInput,
      reviewDepth: "quick" as const,
      needsToHappenNext: "apologize" as const,
      repairBranchActive: true,
    } as ReviewInput;
    const insert = reviewModuleConfig.buildDerivedInsert(quickWithTrigger) as Record<
      string,
      unknown
    >;
    expect(insert.repair_branch_active).toBe(false);
    expect(insert.impact_to_name).toBe(null);
  });
});

describe("prepareModuleConfig.buildDerivedInsert — SOT column mapping", () => {
  it("maps Prepare SOT fields to the right DB columns", () => {
    const insert = prepareModuleConfig.buildDerivedInsert(basePrepareInput) as Record<
      string,
      unknown
    >;

    expect(insert.path).toBe("sot_v2");
    expect(insert.situation_text).toBe(basePrepareInput.situation);
    expect(insert.primary_emotion).toBe(basePrepareInput.primaryEmotion);
    expect(insert.body_location).toBe("chest");
    expect(insert.emotion_as_data).toBe(basePrepareInput.emotionAsData);
    expect(insert.default_pattern).toBe(basePrepareInput.defaultPattern);
    expect(insert.observed_from_them).toBe(basePrepareInput.observedFromThem);
    expect(insert.their_state_hedged).toBe(basePrepareInput.theirStateHedged);
    expect(insert.fairest_version).toBe(basePrepareInput.fairestVersion);
    expect(insert.predicted_reaction).toBe(basePrepareInput.predictedReaction);
    expect(insert.hidden_expectation).toBe(basePrepareInput.hiddenExpectation);
    expect(insert.specific_shift).toBe(basePrepareInput.specificShift);
    expect(insert.outcome_floor).toBe(basePrepareInput.outcomeFloor);
    expect(insert.neutral_check_question).toBe(
      basePrepareInput.neutralCheckQuestion,
    );
    expect(insert.opener).toBe(basePrepareInput.opener);
    // SOT 2026-05-08 fix1 (#2): trigger_plan was being dropped — schema
    // required it, prompt rendered it, but no column write.
    expect(insert.trigger_plan).toBe(basePrepareInput.triggerPlan);
  });
});

// Sanity: aiVersionValue and module names are pinned to the documented
// SOT-follow-up values. A drift here lands legacy rows under the new
// version, breaking generator_version reads downstream.
describe("module configs — pinned identity", () => {
  it("review.aiVersionValue is 9 (SOT fix5 Commit-5 marker)", () => {
    expect(reviewModuleConfig.aiVersionValue).toBe(9);
    expect(reviewModuleConfig.moduleName).toBe("review");
    expect(reviewModuleConfig.derivedTable).toBe("review_entries");
  });

  it("prepare.aiVersionValue is 8 (SOT fix1 Commit-4 marker)", () => {
    expect(prepareModuleConfig.aiVersionValue).toBe(8);
    expect(prepareModuleConfig.moduleName).toBe("prepare");
    expect(prepareModuleConfig.derivedTable).toBe("prepare_entries");
  });
});

