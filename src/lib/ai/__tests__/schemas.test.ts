import { describe, it, expect } from "vitest";
import {
  refusalShape,
  prepareOutputSchema,
  reviewOutputSchema,
  beforeYouSendOutputSchema,
} from "@/lib/ai/schemas";

// ============================================================
// refusalShape (Coach v2 commit 1)
// ============================================================
describe("refusalShape", () => {
  it("parses a valid refusal object", () => {
    const valid = {
      mode: "refusal",
      refusal_reason: "safety_concern",
      message_to_user:
        "This sounds serious. Please reach out to 988 — the Suicide & Crisis Lifeline — right now.",
      suggested_resource: "988",
    };
    expect(refusalShape.safeParse(valid).success).toBe(true);
  });

  it("rejects an object missing message_to_user", () => {
    expect(
      refusalShape.safeParse({
        mode: "refusal",
        refusal_reason: "out_of_scope",
        suggested_resource: "none",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown refusal_reason", () => {
    expect(
      refusalShape.safeParse({
        mode: "refusal",
        refusal_reason: "other",
        message_to_user: "Something",
        suggested_resource: "none",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown suggested_resource", () => {
    expect(
      refusalShape.safeParse({
        mode: "refusal",
        refusal_reason: "safety_concern",
        message_to_user: "Please call for help.",
        suggested_resource: "911",
      }).success,
    ).toBe(false);
  });

  it("rejects a whitespace-only message_to_user after trim", () => {
    expect(
      refusalShape.safeParse({
        mode: "refusal",
        refusal_reason: "out_of_scope",
        message_to_user: "   ",
        suggested_resource: "none",
      }).success,
    ).toBe(false);
  });

  it("rejects a message_to_user over 400 chars", () => {
    expect(
      refusalShape.safeParse({
        mode: "refusal",
        refusal_reason: "safety_concern",
        message_to_user: "a".repeat(401),
        suggested_resource: "988",
      }).success,
    ).toBe(false);
  });
});

// ============================================================
// prepareOutputSchema (Coach redesign 2026-04-23)
// ============================================================
const validPrepareNormal = {
  mode: "normal",
  real_issue:
    "She's not actually angry about the trash — she's reading your habit as 'you don't notice the load I carry.'",
  reality_check_question: "What did you mean when you said it's been a long week?",
  thing_not_to_do: "Don't open with 'I just want to clear something up.'",
  they_might_need: "She likely needs to feel seen for the load before she can hear logistics.",
  best_next_move:
    "Tonight when she's done with bedtime, sit next to her and ask: 'What's been hardest about this week?'",
  pattern_tag: "assumed_meaning_without_checking",
};

describe("prepareOutputSchema", () => {
  it("parses a valid normal-mode Prepare output", () => {
    expect(prepareOutputSchema.safeParse(validPrepareNormal).success).toBe(true);
  });

  it("parses a valid refusal-mode Prepare output", () => {
    expect(
      prepareOutputSchema.safeParse({
        mode: "refusal",
        refusal_reason: "safety_concern",
        message_to_user: "Please reach out to 988 right now.",
        suggested_resource: "988",
      }).success,
    ).toBe(true);
  });

  it("rejects a normal-mode output missing pattern_tag", () => {
    const { pattern_tag: _omit, ...rest } = validPrepareNormal;
    void _omit;
    expect(prepareOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an unknown pattern_tag", () => {
    expect(
      prepareOutputSchema.safeParse({
        ...validPrepareNormal,
        pattern_tag: "made_up_tag",
      }).success,
    ).toBe(false);
  });

  it("rejects a normal-mode output missing real_issue", () => {
    const { real_issue: _omit, ...rest } = validPrepareNormal;
    void _omit;
    expect(prepareOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a best_next_move over 300 chars", () => {
    expect(
      prepareOutputSchema.safeParse({
        ...validPrepareNormal,
        best_next_move: "a".repeat(301),
      }).success,
    ).toBe(false);
  });

  it("rejects whitespace-only thing_not_to_do after trim", () => {
    expect(
      prepareOutputSchema.safeParse({
        ...validPrepareNormal,
        thing_not_to_do: "   ",
      }).success,
    ).toBe(false);
  });
});

// ============================================================
// reviewOutputSchema (Coach redesign 2026-04-23) — discriminated
// ============================================================
const validReviewBase = {
  mode: "normal",
  how_you_came_across:
    "Your opener landed as a verdict — 'we need to talk' read like a foregone conclusion to her.",
  impact_vs_intent:
    "You meant to clarify timing but she heard 'this is going to be hard,' which put her on guard.",
  alternative_explanation:
    "She may have been bracing for the budget conversation again, not actually upset about the calendar.",
  question_you_missed: "What part of this week has been hardest for you?",
  pattern_tag: "moved_to_solution_too_fast",
};

const validReviewWithRepair = {
  ...validReviewBase,
  what_to_own:
    "Cutting her off twice when she tried to explain the late report — she stopped trying after the second time.",
  impact_on_them:
    "She likely felt cornered and unheard, like her version of events didn't matter.",
  thing_not_to_say: "Don't open with 'I'm sorry but I was just trying to help.'",
  recommended_timing:
    "Tomorrow morning in person, not over text tonight while she's still cooling down.",
};

describe("reviewOutputSchema", () => {
  it("parses a Review without the repair branch (4 base fields only)", () => {
    expect(reviewOutputSchema.safeParse(validReviewBase).success).toBe(true);
  });

  it("parses a Review with the repair branch (4 base + 4 repair fields)", () => {
    expect(reviewOutputSchema.safeParse(validReviewWithRepair).success).toBe(true);
  });

  it("parses a Review refusal", () => {
    expect(
      reviewOutputSchema.safeParse({
        mode: "refusal",
        refusal_reason: "safety_concern",
        message_to_user: "This sounds like an unsafe situation. Please reach out to the National Domestic Violence Hotline.",
        suggested_resource: "domestic_violence_hotline",
      }).success,
    ).toBe(true);
  });

  it("rejects a Review missing impact_vs_intent (always-required)", () => {
    const { impact_vs_intent: _omit, ...rest } = validReviewBase;
    void _omit;
    expect(reviewOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a Review missing question_you_missed (always-required)", () => {
    const { question_you_missed: _omit, ...rest } = validReviewBase;
    void _omit;
    expect(reviewOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("accepts a Review with only some repair-branch fields populated", () => {
    // Partial repair branch — the schema marks all 4 as .optional(), so any
    // combination is structurally valid. The prompt instructs the model to
    // either populate all 4 or none, but the schema doesn't enforce that.
    const partial = { ...validReviewBase, what_to_own: validReviewWithRepair.what_to_own };
    expect(reviewOutputSchema.safeParse(partial).success).toBe(true);
  });
});

// ============================================================
// beforeYouSendOutputSchema (NEW Coach redesign 2026-04-23)
// ============================================================
const validBysSafe = {
  mode: "normal",
  verdict: "safe",
  how_this_will_land:
    "She's likely to read this as you finally hearing her on the budget — the acknowledgement is concrete.",
  what_its_missing:
    "A specific next step would help — right now it ends without giving her something to respond to.",
  thing_to_cut:
    "You wrote: 'I get it now.' Cut this — she'll read 'now' as 'not before,' which lands as condescension.",
  check_in_question: "Am I asking her to forgive me, or am I asking her what she needs?",
};

const validBysDoNotSend = {
  ...validBysSafe,
  verdict: "do_not_send",
};

describe("beforeYouSendOutputSchema", () => {
  it("parses a verdict=safe BYS output", () => {
    expect(beforeYouSendOutputSchema.safeParse(validBysSafe).success).toBe(true);
  });

  it("parses a verdict=risky BYS output", () => {
    expect(
      beforeYouSendOutputSchema.safeParse({ ...validBysSafe, verdict: "risky" }).success,
    ).toBe(true);
  });

  it("parses a verdict=do_not_send BYS output", () => {
    expect(beforeYouSendOutputSchema.safeParse(validBysDoNotSend).success).toBe(true);
  });

  it("parses a BYS refusal", () => {
    expect(
      beforeYouSendOutputSchema.safeParse({
        mode: "refusal",
        refusal_reason: "safety_concern",
        message_to_user: "This message describes intent to harm. Please reach out to 988.",
        suggested_resource: "988",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown verdict value", () => {
    expect(
      beforeYouSendOutputSchema.safeParse({ ...validBysSafe, verdict: "send_anyway" }).success,
    ).toBe(false);
  });

  it("rejects a missing thing_to_cut", () => {
    const { thing_to_cut: _omit, ...rest } = validBysSafe;
    void _omit;
    expect(beforeYouSendOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a how_this_will_land over 300 chars", () => {
    expect(
      beforeYouSendOutputSchema.safeParse({
        ...validBysSafe,
        how_this_will_land: "a".repeat(301),
      }).success,
    ).toBe(false);
  });
});
