// SOT 2026-05-08 fix6 (#14): round-trip tests on the coach route configs'
// buildDerivedInsert + buildPayloadFields. Schema-only tests catch shape
// validation drift but miss column-rename drift — if `feltAtHardestMoment
// → felt_at_hardest_moment` ever flips to a wrong column name, Zod still
// parses the post but the row lands in the wrong DB column and the saved entry
// renders empty. These tests pin the mapping.

import { describe, it, expect } from "vitest";
import { reviewModuleConfig } from "@/app/api/coach/review/route";
import { prepareModuleConfig } from "@/app/api/coach/prepare/route";
import { pulseCheckModuleConfig } from "@/app/api/coach/pulse-check/route";
import { beforeYouSendModuleConfig } from "@/app/api/coach/before-send/route";

// Helper types matching the parsed-input shapes the route configs expect.
type ReviewInput = Parameters<typeof reviewModuleConfig.buildDerivedInsert>[0];
type PrepareInput = Parameters<typeof prepareModuleConfig.buildDerivedInsert>[0];
type PulseInput = Parameters<typeof pulseCheckModuleConfig.buildDerivedInsert>[0];
type BysInput = Parameters<
  typeof beforeYouSendModuleConfig.buildDerivedInsert
>[0];

const baseBysInput: BysInput = {
  tier: "quick",
  situationFacts: "She cut my budget request in the team meeting.",
  desiredOutcome: "Reopen the conversation without it turning into a fight.",
  draftText: "I get it now — can we talk tonight?",
  messageType: "repair",
} as BysInput;

const basePulseInput: PulseInput = {
  tier: "deep",
  personName: "Sam",
  whatFeelsOff: "Quieter than usual.",
  whatChangedVsBefore: "Was warm last week; short replies now.",
  storyAndAlternative: {
    story: "I'm being avoided.",
    alternative: "They're swamped at work.",
  },
  signalTestConfirm: "Still terse by Friday = signal.",
  signalTestDisconfirm: "Warms up after the deadline = noise.",
  nextMove: "observe",
  checkWindow: "3d",
} as PulseInput;

const baseReviewInput: ReviewInput = {
  tier: "quick",
  personName: "Sam",
  whatHappened: "We argued.",
  observedRaw: "they paused",
  interpretedRaw: "I read shutdown",
  whatYouDid: "kept pushing",
  easierOrHarder: "harder for them to circle back",
  dataAndUpdate: "push freezes info; ask what they need before naming what I see",
  nextMove: "repair",
} as ReviewInput;

const basePrepareInput: PrepareInput = {
  tier: "quick",
  personName: "Alex",
  relationship: "romantic",
  conversationTypePrimary: "align",
  conversationTypeSecondary: "connect",
  situation: "Chores split.",
  feelingAndWhy: "I feel resentful because it keeps landing on me; it matters because it says I'm not a partner.",
  myPattern: "I go quiet and keep score instead of saying it.",
  fairestVersion: "picking up overtime",
  theirFeelingWant: "They probably feel stretched and want credit for the overtime.",
  hiddenAskAndFloor: "they volunteer for dishes; floor is naming the recurrence",
  opener: "Hey, can we talk about how we split things?",
  triggerPlan: "If chest-tight, pause and ask one question.",
} as PrepareInput;

describe("reviewModuleConfig.buildDerivedInsert — lean column mapping", () => {
  it("maps lean Review fields to the right DB columns", () => {
    const insert = reviewModuleConfig.buildDerivedInsert(baseReviewInput) as Record<
      string,
      unknown
    >;

    expect(insert.what_happened).toBe(baseReviewInput.whatHappened);
    expect(insert.observed_raw).toBe(baseReviewInput.observedRaw);
    expect(insert.interpreted_raw).toBe(baseReviewInput.interpretedRaw);
    expect(insert.what_you_did).toBe(baseReviewInput.whatYouDid);
    expect(insert.easier_or_harder).toBe(baseReviewInput.easierOrHarder);
    // Merged lesson + treat-as-data column.
    expect(insert.data_and_update).toBe(baseReviewInput.dataAndUpdate);
    // New lean next-move column (replaces needs_to_happen_next taxonomy).
    expect(insert.next_move).toBe("repair");
    expect(insert.ai_tier).toBe("quick");
    // review_depth deprecated — ai_tier is the tier of record; left null.
    expect(insert.review_depth).toBe(null);
    // No in-form repair branch in the lean Review; always false (Repair is its
    // own module now). The column is NOT NULL so a value must be written.
    expect(insert.repair_branch_active).toBe(false);
  });

  it("forwards the server-resolved linked_prepare_entry_id when present", () => {
    const linked = {
      ...baseReviewInput,
      linkedPrepareEntryId: "11111111-1111-1111-1111-111111111111",
    } as ReviewInput;
    const insert = reviewModuleConfig.buildDerivedInsert(linked) as Record<
      string,
      unknown
    >;
    expect(insert.linked_prepare_entry_id).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("writes null linked_prepare_entry_id when no link resolved", () => {
    const insert = reviewModuleConfig.buildDerivedInsert(baseReviewInput) as Record<
      string,
      unknown
    >;
    expect(insert.linked_prepare_entry_id).toBe(null);
  });
});

describe("prepareModuleConfig.buildDerivedInsert — lean column mapping", () => {
  it("maps lean Prepare fields to the right DB columns", () => {
    const insert = prepareModuleConfig.buildDerivedInsert(basePrepareInput) as Record<
      string,
      unknown
    >;

    expect(insert.path).toBe("lean_v2");
    expect(insert.situation_text).toBe(basePrepareInput.situation);
    expect(insert.conversation_type_primary).toBe("align");
    expect(insert.conversation_type_secondary).toBe("connect");
    expect(insert.feeling_and_why).toBe(basePrepareInput.feelingAndWhy);
    expect(insert.my_pattern).toBe(basePrepareInput.myPattern);
    expect(insert.fairest_version).toBe(basePrepareInput.fairestVersion);
    expect(insert.their_feeling_want).toBe(basePrepareInput.theirFeelingWant);
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
// on buildDerivedInsert. The raw_records payload is what the export reads on
// raw rows AND what the AI prompt builder receives — a column-name drift
// here lands the user's content in an unread payload field and renders
// blank coaching even when the derived row is correct.
describe("reviewModuleConfig.buildPayloadFields — lean field passthrough", () => {
  it("passes through every lean input to the raw payload", () => {
    const payload = reviewModuleConfig.buildPayloadFields(baseReviewInput) as Record<
      string,
      unknown
    >;
    expect(payload.tier).toBe("quick");
    expect(payload.personName).toBe(baseReviewInput.personName);
    expect(payload.whatHappened).toBe(baseReviewInput.whatHappened);
    expect(payload.observedRaw).toBe(baseReviewInput.observedRaw);
    expect(payload.interpretedRaw).toBe(baseReviewInput.interpretedRaw);
    expect(payload.whatYouDid).toBe(baseReviewInput.whatYouDid);
    expect(payload.easierOrHarder).toBe(baseReviewInput.easierOrHarder);
    expect(payload.dataAndUpdate).toBe(baseReviewInput.dataAndUpdate);
    expect(payload.nextMove).toBe("repair");
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
    expect(payload.conversationTypePrimary).toBe("align");
    expect(payload.conversationTypeSecondary).toBe("connect");
    expect(payload.situation).toBe(basePrepareInput.situation);
    expect(payload.feelingAndWhy).toBe(basePrepareInput.feelingAndWhy);
    expect(payload.myPattern).toBe(basePrepareInput.myPattern);
    expect(payload.fairestVersion).toBe(basePrepareInput.fairestVersion);
    expect(payload.theirFeelingWant).toBe(basePrepareInput.theirFeelingWant);
    expect(payload.hiddenAskAndFloor).toBe(basePrepareInput.hiddenAskAndFloor);
    expect(payload.opener).toBe(basePrepareInput.opener);
    expect(payload.triggerPlan).toBe(basePrepareInput.triggerPlan);
  });
});

describe("pulseCheckModuleConfig.buildDerivedInsert — lean column mapping", () => {
  it("maps lean Pulse fields to the right DB columns", () => {
    const insert = pulseCheckModuleConfig.buildDerivedInsert(
      basePulseInput,
    ) as Record<string, unknown>;

    expect(insert.what_feels_off).toBe(basePulseInput.whatFeelsOff);
    // whatChangedVsBefore reuses the existing what_changed_and_before column.
    expect(insert.what_changed_and_before).toBe(
      basePulseInput.whatChangedVsBefore,
    );
    expect(insert.story).toBe(basePulseInput.storyAndAlternative.story);
    expect(insert.alternative).toBe(
      basePulseInput.storyAndAlternative.alternative,
    );
    // Two-sided signal test → two columns.
    expect(insert.signal_test_confirm).toBe(basePulseInput.signalTestConfirm);
    expect(insert.signal_test_disconfirm).toBe(
      basePulseInput.signalTestDisconfirm,
    );
    expect(insert.next_move).toBe("observe");
    expect(insert.check_window).toBe("3d");
    expect(insert.ai_tier).toBe("deep");
    // Deprecated-in-place columns superseded by the new ones — explicit null.
    expect(insert.signal_noise_observation).toBe(null);
    expect(insert.next_move_chip).toBe(null);
  });

  it("writes null check_window when the move is not observe", () => {
    const insert = pulseCheckModuleConfig.buildDerivedInsert({
      ...basePulseInput,
      nextMove: "do_nothing",
      checkWindow: null,
    } as PulseInput) as Record<string, unknown>;
    expect(insert.check_window).toBe(null);
    expect(insert.next_move).toBe("do_nothing");
  });
});

describe("pulseCheckModuleConfig.buildPayloadFields — lean field passthrough", () => {
  it("passes through every lean input to the raw payload", () => {
    const payload = pulseCheckModuleConfig.buildPayloadFields(
      basePulseInput,
    ) as Record<string, unknown>;
    expect(payload.tier).toBe("deep");
    expect(payload.personName).toBe(basePulseInput.personName);
    expect(payload.whatFeelsOff).toBe(basePulseInput.whatFeelsOff);
    expect(payload.whatChangedVsBefore).toBe(
      basePulseInput.whatChangedVsBefore,
    );
    expect(payload.signalTestConfirm).toBe(basePulseInput.signalTestConfirm);
    expect(payload.signalTestDisconfirm).toBe(
      basePulseInput.signalTestDisconfirm,
    );
    expect(payload.nextMove).toBe("observe");
    expect(payload.checkWindow).toBe("3d");
  });
});

describe("beforeYouSendModuleConfig.buildDerivedInsert — lean 3-question mapping", () => {
  it("maps the 3 inputs to columns and persists ai_tier=quick", () => {
    const insert = beforeYouSendModuleConfig.buildDerivedInsert(
      baseBysInput,
    ) as Record<string, unknown>;

    expect(insert.draft_text).toBe(baseBysInput.draftText);
    expect(insert.situation_facts).toBe(baseBysInput.situationFacts);
    expect(insert.desired_outcome).toBe(baseBysInput.desiredOutcome);
    expect(insert.message_type).toBe("repair");
    expect(insert.ai_tier).toBe("quick");
  });

  it("always nulls the legacy intent_optional / risk_context columns", () => {
    const insert = beforeYouSendModuleConfig.buildDerivedInsert({
      tier: "quick",
      situationFacts: "S",
      desiredOutcome: "O",
      draftText: "Quick draft.",
      messageType: "ask",
    } as BysInput) as Record<string, unknown>;
    expect(insert.intent_optional).toBe(null);
    expect(insert.risk_context).toBe(null);
    expect(insert.ai_tier).toBe("quick");
  });
});

describe("beforeYouSendModuleConfig.buildPayloadFields — field passthrough", () => {
  it("passes through tier + the 3 inputs + messageType to the raw payload", () => {
    const payload = beforeYouSendModuleConfig.buildPayloadFields(
      baseBysInput,
    ) as Record<string, unknown>;
    expect(payload.tier).toBe("quick");
    expect(payload.draftText).toBe(baseBysInput.draftText);
    expect(payload.situationFacts).toBe(baseBysInput.situationFacts);
    expect(payload.desiredOutcome).toBe(baseBysInput.desiredOutcome);
    expect(payload.messageType).toBe("repair");
  });
});

// Sanity: aiVersionValue and module names are pinned to the documented
// SOT-follow-up values. A drift here lands legacy rows under the new
// version, breaking generator_version reads downstream.
describe("module configs — pinned identity", () => {
  it("review.aiVersionValue is 10 (coins lean-tier marker)", () => {
    expect(reviewModuleConfig.aiVersionValue).toBe(10);
    expect(reviewModuleConfig.moduleName).toBe("review");
    expect(reviewModuleConfig.derivedTable).toBe("review_entries");
  });

  it("prepare.aiVersionValue is 9 (coins lean-tier marker)", () => {
    expect(prepareModuleConfig.aiVersionValue).toBe(9);
    expect(prepareModuleConfig.moduleName).toBe("prepare");
    expect(prepareModuleConfig.derivedTable).toBe("prepare_entries");
  });

  it("pulse.aiVersionValue is 2 (coins lean-tier marker)", () => {
    expect(pulseCheckModuleConfig.aiVersionValue).toBe(2);
    expect(pulseCheckModuleConfig.moduleName).toBe("pulse_check");
    expect(pulseCheckModuleConfig.derivedTable).toBe("pulse_check_entries");
  });

  it("before_you_send.aiVersionValue is 3 (lean 3-question marker)", () => {
    expect(beforeYouSendModuleConfig.aiVersionValue).toBe(3);
    expect(beforeYouSendModuleConfig.moduleName).toBe("before_you_send");
    expect(beforeYouSendModuleConfig.derivedTable).toBe(
      "before_you_send_entries",
    );
  });
});

