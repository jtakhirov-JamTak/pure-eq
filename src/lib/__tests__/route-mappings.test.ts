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
  tier: "quick",
  personName: "Alex",
  relationship: "partner",
  conversationMove: "boundary",
  situation: "Chores split.",
  fairestVersion: "picking up overtime",
  hiddenAskAndFloor: "they volunteer for dishes; floor is naming the recurrence",
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

describe("prepareModuleConfig.buildDerivedInsert — lean column mapping", () => {
  it("maps lean Prepare fields to the right DB columns", () => {
    const insert = prepareModuleConfig.buildDerivedInsert(basePrepareInput) as Record<
      string,
      unknown
    >;

    expect(insert.path).toBe("lean_v1");
    expect(insert.situation_text).toBe(basePrepareInput.situation);
    expect(insert.conversation_move).toBe("boundary");
    expect(insert.fairest_version).toBe(basePrepareInput.fairestVersion);
    expect(insert.hidden_ask_and_floor).toBe(basePrepareInput.hiddenAskAndFloor);
    expect(insert.opener).toBe(basePrepareInput.opener);
    expect(insert.trigger_plan).toBe(basePrepareInput.triggerPlan);
    expect(insert.ai_tier).toBe("quick");
    // predicted_reaction is now written from the AI Quick card on the
    // step-13 update (extractDerivedFromAi) — null at insert time.
    expect(insert.predicted_reaction).toBe(null);
  });
});

describe("prepareModuleConfig.extractDerivedFromAi — Predicted Reaction → column", () => {
  type AiArg = Parameters<
    NonNullable<typeof prepareModuleConfig.extractDerivedFromAi>
  >[0];

  it("copies the AI predicted_reaction card into the column on normal output", () => {
    const extra = prepareModuleConfig.extractDerivedFromAi?.({
      mode: "normal",
      pressure_check: "Don't open with 'we need to talk.'",
      cleaner_opener: "Hey, got 10 minutes to sort chores?",
      predicted_reaction: "They'll likely go quiet at first.",
      pattern_tag: "withdrew_under_tension",
    } as AiArg);
    expect(extra).toEqual({
      predicted_reaction: "They'll likely go quiet at first.",
    });
  });

  it("writes nothing on refusal output", () => {
    const extra = prepareModuleConfig.extractDerivedFromAi?.({
      mode: "refusal",
      refusal_reason: "out_of_scope",
      message_to_user: "...",
      suggested_resource: "none",
    } as AiArg);
    expect(extra).toEqual({});
  });
});

// 2026-05-17 fix3 (#23): buildPayloadFields round-trip. The PR-body claimed
// fix6 covered buildPayloadFields too, but the original tests only asserted
// on buildDerivedInsert. The raw_records payload is what /history reads on
// raw rows AND what the AI prompt builder receives — a column-name drift
// here lands the user's content in an unread payload field and renders
// blank coaching even when the derived row is correct.
describe("reviewModuleConfig.buildPayloadFields — SOT field passthrough", () => {
  it("passes through every SOT input to the raw payload (Full happy path)", () => {
    const payload = reviewModuleConfig.buildPayloadFields(baseReviewInput) as Record<
      string,
      unknown
    >;
    expect(payload.reviewDepth).toBe("full");
    expect(payload.whatHappened).toBe(baseReviewInput.whatHappened);
    expect(payload.feltAtHardestMoment).toBe(baseReviewInput.feltAtHardestMoment);
    expect(payload.bodyLocation).toBe("chest");
    expect(payload.feelingTracking).toBe(baseReviewInput.feelingTracking);
    expect(payload.easierOrHarder).toBe(baseReviewInput.easierOrHarder);
    expect(payload.treatAsData).toBe(baseReviewInput.treatAsData);
    expect(payload.somethingThatHelped).toBe(baseReviewInput.somethingThatHelped);
    expect(payload.theirInMomentExperience).toBe(
      baseReviewInput.theirInMomentExperience,
    );
    expect(payload.signsHowTheyLeft).toBe(baseReviewInput.signsHowTheyLeft);
    expect(payload.turningPoint).toBe(baseReviewInput.turningPoint);
    expect(payload.needsToHappenNext).toBe("apologize");
    expect(payload.forecast).toBe(baseReviewInput.forecast);
    expect(payload.whatProtecting).toEqual(baseReviewInput.whatProtecting);
    expect(payload.lessonScreen).toEqual(baseReviewInput.lessonScreen);
  });

  it("strips repair-branch payload fields when server-derivation says inactive", () => {
    // Mirrors the buildDerivedInsert smuggle test (#4). The payload column
    // is the second smuggle surface — if it still carries content while the
    // derived row stamps null, /history reads on raw rows would show repair
    // content for a row whose DB columns show none.
    const smuggled = {
      ...baseReviewInput,
      needsToHappenNext: "set_boundary" as const,
      repairBranchActive: true,
    } as ReviewInput;
    const payload = reviewModuleConfig.buildPayloadFields(smuggled) as Record<
      string,
      unknown
    >;
    expect(payload.repairBranchActive).toBe(false);
    expect(payload.impactToName).toBe(null);
    expect(payload.theirNeedFirst).toBe(null);
    expect(payload.pressureVsCare).toBe(null);
    expect(payload.timingWhen).toBe(null);
    expect(payload.timingNow).toBe(null);
    expect(payload.firstRepairSentence).toBe(null);
  });
});

describe("prepareModuleConfig.buildPayloadFields — lean field passthrough", () => {
  it("passes through every lean input to the raw payload", () => {
    const payload = prepareModuleConfig.buildPayloadFields(basePrepareInput) as Record<
      string,
      unknown
    >;
    expect(payload.tier).toBe("quick");
    expect(payload.personName).toBe(basePrepareInput.personName);
    expect(payload.relationship).toBe(basePrepareInput.relationship);
    expect(payload.conversationMove).toBe("boundary");
    expect(payload.situation).toBe(basePrepareInput.situation);
    expect(payload.fairestVersion).toBe(basePrepareInput.fairestVersion);
    expect(payload.hiddenAskAndFloor).toBe(basePrepareInput.hiddenAskAndFloor);
    expect(payload.opener).toBe(basePrepareInput.opener);
    expect(payload.triggerPlan).toBe(basePrepareInput.triggerPlan);
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

  it("prepare.aiVersionValue is 9 (coins lean-tier marker)", () => {
    expect(prepareModuleConfig.aiVersionValue).toBe(9);
    expect(prepareModuleConfig.moduleName).toBe("prepare");
    expect(prepareModuleConfig.derivedTable).toBe("prepare_entries");
  });
});

