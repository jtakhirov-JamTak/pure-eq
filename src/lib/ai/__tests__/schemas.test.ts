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
// prepareOutputSchema (coins redesign 2026-05-29) — tier-aware
// ============================================================
// Quick = 3 required cards; Deep adds 2 optional cards. The two Deep fields
// are .optional() so a Quick output validates without them.
const validPrepareQuick = {
  mode: "normal",
  pressure_check: "Don't open with 'we need to talk.'",
  cleaner_opener: "Hey, got 10 minutes tonight to sort the chore split?",
  predicted_reaction:
    "She'll likely go quiet at first, then ask why it matters now.",
  pattern_tag: "assumed_meaning_without_checking",
};

const validPrepareDeep = {
  ...validPrepareQuick,
  neutral_check_question: "What's been eating most of your bandwidth this week?",
  deeper_read:
    "The fairest read is she's swamped, not careless — and your hidden ask is to feel the load is shared.",
};

describe("prepareOutputSchema", () => {
  it("parses a valid Quick normal-mode Prepare output (3 cards)", () => {
    expect(prepareOutputSchema.safeParse(validPrepareQuick).success).toBe(true);
  });

  it("parses a valid Deep normal-mode Prepare output (5 cards)", () => {
    expect(prepareOutputSchema.safeParse(validPrepareDeep).success).toBe(true);
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
    const { pattern_tag: _omit, ...rest } = validPrepareQuick;
    void _omit;
    expect(prepareOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an unknown pattern_tag", () => {
    expect(
      prepareOutputSchema.safeParse({
        ...validPrepareQuick,
        pattern_tag: "made_up_tag",
      }).success,
    ).toBe(false);
  });

  it("rejects a normal-mode output missing pressure_check (required Quick card)", () => {
    const { pressure_check: _omit, ...rest } = validPrepareQuick;
    void _omit;
    expect(prepareOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a predicted_reaction over 300 chars", () => {
    expect(
      prepareOutputSchema.safeParse({
        ...validPrepareQuick,
        predicted_reaction: "a".repeat(301),
      }).success,
    ).toBe(false);
  });

  it("rejects whitespace-only cleaner_opener after trim", () => {
    expect(
      prepareOutputSchema.safeParse({
        ...validPrepareQuick,
        cleaner_opener: "   ",
      }).success,
    ).toBe(false);
  });
});

// ============================================================
// reviewOutputSchema — tier-aware InteractionLearning (coins redesign 2026-05-29)
// ============================================================
// Quick = 3 cards (turning_point, pattern_data, recommended_move); Deep adds 2
// (their_likely_experience, repeat_stop_update). Deep cards are .optional() so a
// Quick output validates without them.
const validReviewQuick = {
  mode: "normal",
  turning_point:
    "When you said 'fine, forget it,' her tone hardened — that's the pivot the whole thing turned on.",
  pattern_data:
    "You answered the worry with logic before naming you'd heard it — that move is what froze the exchange.",
  recommended_move:
    "Open the next one by naming what you heard, then ask what she needs before offering a fix.",
  pattern_tag: "moved_to_solution_too_fast",
};

const validReviewDeep = {
  ...validReviewQuick,
  their_likely_experience:
    "She may have felt cornered and quietly stopped trying to be understood.",
  repeat_stop_update:
    "Repeat: asking what she needs. Stop: rebutting mid-sentence. Update: read her pauses as processing.",
};

describe("reviewOutputSchema", () => {
  it("parses a Quick Review (3 cards)", () => {
    expect(reviewOutputSchema.safeParse(validReviewQuick).success).toBe(true);
  });

  it("parses a Deep Review (3 + 2 cards)", () => {
    expect(reviewOutputSchema.safeParse(validReviewDeep).success).toBe(true);
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

  it("rejects a Review missing pattern_data (Quick-required)", () => {
    const { pattern_data: _omit, ...rest } = validReviewQuick;
    void _omit;
    expect(reviewOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a Review missing recommended_move (Quick-required)", () => {
    const { recommended_move: _omit, ...rest } = validReviewQuick;
    void _omit;
    expect(reviewOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a whitespace-only turning_point", () => {
    expect(
      reviewOutputSchema.safeParse({ ...validReviewQuick, turning_point: "   " })
        .success,
    ).toBe(false);
  });
});

// ============================================================
// beforeYouSendOutputSchema — verdict + 3 cards (lean 3-question redesign 2026-06-01)
// ============================================================
// verdict + main_risk + cleaner_version (nullable, null on do_not_send) +
// why_this_works. The old tier-aware set is fully removed.
const validBys = {
  mode: "normal",
  verdict: "risky",
  main_risk:
    "She'll read 'I get it now' as 'I didn't before' — it lands as condescension and reopens the fight.",
  cleaner_version:
    "Hey — I've been sitting with the budget conversation and I don't think I gave your side enough weight. Can we talk tonight?",
  why_this_works:
    "It owns the gap without the loaded 'now,' and asks rather than tells — which moves toward reopening the talk calmly.",
};

describe("beforeYouSendOutputSchema", () => {
  it("parses a verdict=risky BYS output (3 cards)", () => {
    expect(beforeYouSendOutputSchema.safeParse(validBys).success).toBe(true);
  });

  it("parses a verdict=safe BYS output", () => {
    expect(
      beforeYouSendOutputSchema.safeParse({ ...validBys, verdict: "safe" }).success,
    ).toBe(true);
  });

  it("parses a verdict=do_not_send BYS output with cleaner_version=null", () => {
    expect(
      beforeYouSendOutputSchema.safeParse({
        ...validBys,
        verdict: "do_not_send",
        cleaner_version: null,
      }).success,
    ).toBe(true);
  });

  it("accepts a null cleaner_version (nothing worth sending yet)", () => {
    expect(
      beforeYouSendOutputSchema.safeParse({ ...validBys, cleaner_version: null })
        .success,
    ).toBe(true);
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
      beforeYouSendOutputSchema.safeParse({ ...validBys, verdict: "send_anyway" }).success,
    ).toBe(false);
  });

  it("rejects a missing main_risk", () => {
    const { main_risk: _omit, ...rest } = validBys;
    void _omit;
    expect(beforeYouSendOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing cleaner_version (key required, value may be null)", () => {
    const { cleaner_version: _omit, ...rest } = validBys;
    void _omit;
    expect(beforeYouSendOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing why_this_works", () => {
    const { why_this_works: _omit, ...rest } = validBys;
    void _omit;
    expect(beforeYouSendOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a main_risk over 300 chars", () => {
    expect(
      beforeYouSendOutputSchema.safeParse({
        ...validBys,
        main_risk: "a".repeat(301),
      }).success,
    ).toBe(false);
  });

  it("rejects a cleaner_version over 2000 chars", () => {
    expect(
      beforeYouSendOutputSchema.safeParse({
        ...validBys,
        cleaner_version: "a".repeat(2001),
      }).success,
    ).toBe(false);
  });
});
