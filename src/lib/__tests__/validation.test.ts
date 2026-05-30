import { describe, it, expect } from "vitest";
import {
  calibrationBlockSchema,
  createBeforeYouSendSchema,
  createPrepareSchema,
  createPulseCheckSchema,
  createReviewSchema,
} from "@/lib/validation";
import { REPAIR_TRIGGER_NEEDS } from "@/lib/coach/page-flow";

// ============================================================
// Helpers — minimal valid payloads. Tests override individual
// fields to assert per-field validation. Keeping the base small
// makes failure messages legible at a glance.
// ============================================================

// ============================================================
// Review — lean 7-field tiered schema (coins redesign 2026-05-29)
// ============================================================
// The old Quick/Full split + page-5 calibration chips + in-form Repair branch
// are gone. One lean form + a Quick/Deep AI-tier selector. Two formerly-multi
// inputs merge: lessonScreen + treatAsData → dataAndUpdate; needsToHappenNext
// taxonomy → nextMove.
const validReviewBase = {
  tier: "quick" as const,
  personName: "Sam",
  whatHappened: "We argued about the timeline for the Q3 plan.",
  observedRaw: "Their voice got quieter, they stopped making eye contact.",
  interpretedRaw: "I thought they were shutting down because I'd pushed too hard.",
  whatYouDid: "I kept arguing my point instead of pausing.",
  easierOrHarder: "Made it harder for them to bring this up again later.",
  dataAndUpdate: "Pushing freezes info; ask what they need before naming my read.",
  nextMove: "repair" as const,
};

describe("createReviewSchema — lean tiered shape", () => {
  it("accepts a fully-populated lean payload", () => {
    const result = createReviewSchema.safeParse(validReviewBase);
    expect(result.success).toBe(true);
  });

  it("defaults tier to quick when omitted", () => {
    const { tier: _omit, ...minus } = validReviewBase;
    void _omit;
    const result = createReviewSchema.safeParse(minus);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tier).toBe("quick");
  });

  it("accepts tier deep", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      tier: "deep",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown tier", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      tier: "ultra",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty observedRaw", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      observedRaw: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty interpretedRaw", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      interpretedRaw: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects observedRaw over 2000 chars", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      observedRaw: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts observedRaw at exactly 2000 chars", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      observedRaw: "a".repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty dataAndUpdate", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      dataAndUpdate: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty whatYouDid", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      whatYouDid: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown nextMove", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      nextMove: "ghost",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every next-move value (7 values)", () => {
    const moves = [
      "nothing",
      "repair",
      "prepare",
      "set_boundary",
      "follow_up",
      "step_back",
      "save_pattern",
    ] as const;
    for (const move of moves) {
      const result = createReviewSchema.safeParse({
        ...validReviewBase,
        nextMove: move,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects omitted nextMove (required)", () => {
    const { nextMove: _omit, ...minus } = validReviewBase;
    void _omit;
    const result = createReviewSchema.safeParse(minus);
    expect(result.success).toBe(false);
  });

  it("rejects omitted personName (required)", () => {
    const { personName: _omit, ...minus } = validReviewBase;
    void _omit;
    const result = createReviewSchema.safeParse(minus);
    expect(result.success).toBe(false);
  });

  it("accepts a server-resolved linkedPrepareEntryId", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      linkedPrepareEntryId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// Prepare — lean 8-field tiered schema (coins redesign 2026-05-29)
// ============================================================
const validPrepareBase = {
  tier: "quick" as const,
  personName: "Alex",
  relationship: "partner" as const,
  conversationMove: "boundary" as const,
  situation: "Need to talk about how chores are getting split.",
  fairestVersion:
    "They've been picking up extra at work and aren't dodging on purpose.",
  hiddenAskAndFloor:
    "I'm hoping they take over the dishes; floor is naming that this keeps recurring.",
  opener: "Hey, can we talk about how we split things up at home?",
  triggerPlan: "If I feel chest-tightening, I'll pause and ask one question.",
};

describe("createPrepareSchema — lean tiered shape", () => {
  it("accepts a fully-populated lean payload", () => {
    const result = createPrepareSchema.safeParse(validPrepareBase);
    expect(result.success).toBe(true);
  });

  it("defaults tier to quick when omitted", () => {
    const { tier: _omit, ...minus } = validPrepareBase;
    void _omit;
    const result = createPrepareSchema.safeParse(minus);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tier).toBe("quick");
  });

  it("accepts tier deep", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      tier: "deep",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown tier", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      tier: "ultra",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown conversationMove", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      conversationMove: "vent",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every conversation move (6 values)", () => {
    const moves = [
      "clarify",
      "ask",
      "boundary",
      "share",
      "decide",
      "pause",
    ] as const;
    for (const move of moves) {
      const result = createPrepareSchema.safeParse({
        ...validPrepareBase,
        conversationMove: move,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an empty situation", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      situation: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty opener", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      opener: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects opener over 1000 chars", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      opener: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty hiddenAskAndFloor", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      hiddenAskAndFloor: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty fairestVersion", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      fairestVersion: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects omitted conversationMove (required)", () => {
    const { conversationMove: _omit, ...minus } = validPrepareBase;
    void _omit;
    const result = createPrepareSchema.safeParse(minus);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Pulse Check schema — Coach SOT 2026-05-06
// ============================================================
const validPulseCheckBase = {
  personName: "Sam",
  relationship: "partner" as const,
  whatFeelsOff: "Quieter than usual the past few days.",
  whatChangedAndBefore: "Last weekend we were laughing; now short replies.",
  whenItShifted: "Sometime after Sunday brunch.",
  feelingAndBody: {
    text: "Tight chest, slight dread.",
    bodyLocation: "chest" as const,
  },
  theirsNotAboutYou: "They started a new job — could be load not me.",
  storyAndAlternative: {
    story: "I'm being avoided.",
    alternative: "They're tapped out by work and going quiet across the board.",
  },
  signalNoiseObservation: "If they're still terse by Friday, it's signal.",
  nextMoveChip: "wait_observe" as const,
};

describe("createPulseCheckSchema", () => {
  it("accepts a wait_observe payload without lightCheckQuestion", () => {
    const result = createPulseCheckSchema.safeParse(validPulseCheckBase);
    expect(result.success).toBe(true);
  });

  it("requires lightCheckQuestion when nextMoveChip is ask_clarifying", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      nextMoveChip: "ask_clarifying",
    });
    expect(result.success).toBe(false);
  });

  it("requires lightCheckQuestion when nextMoveChip is use_bys", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      nextMoveChip: "use_bys",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ask_clarifying with a non-empty lightCheckQuestion", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      nextMoveChip: "ask_clarifying",
      lightCheckQuestion: "Hey, all good? You've been quiet — anything I should know?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects fuzzy_cant_tell on non-pulse body location enums but accepts it here", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      feelingAndBody: { text: "Cloudy.", bodyLocation: "fuzzy_cant_tell" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown nextMoveChip value", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      nextMoveChip: "spelunk",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty whatFeelsOff", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      whatFeelsOff: "",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Calibration block — SOT 2026-05-08 Commit 3
// ============================================================
// calibrationBlockSchema is retained as an export (the SelectCalibrationChip
// component + legacy /history reads still reference the { compare, shift, floor }
// jsonb shape) even though the lean Review form no longer collects it.

describe("calibrationBlockSchema", () => {
  it("accepts a fully populated 3-field block with SOT chip values", () => {
    const result = calibrationBlockSchema.safeParse({
      compare: "about_right",
      shift: "partial",
      floor: "mostly",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing compare", () => {
    const result = calibrationBlockSchema.safeParse({
      shift: "partial",
      floor: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty shift", () => {
    const result = calibrationBlockSchema.safeParse({
      compare: "better",
      shift: "",
      floor: "no",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an off-enum value (fix2 — schema enforces server-side)", () => {
    const result = calibrationBlockSchema.safeParse({
      compare: "lolwut",
      shift: "yes",
      floor: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every SOT compare chip", () => {
    for (const v of ["better", "about_right", "worse"] as const) {
      const result = calibrationBlockSchema.safeParse({
        compare: v,
        shift: "yes",
        floor: "yes",
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts every SOT shift chip", () => {
    for (const v of ["yes", "partial", "no", "too_soon"] as const) {
      const result = calibrationBlockSchema.safeParse({
        compare: "better",
        shift: v,
        floor: "yes",
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts every SOT floor chip", () => {
    for (const v of ["yes", "mostly", "no"] as const) {
      const result = calibrationBlockSchema.safeParse({
        compare: "better",
        shift: "yes",
        floor: v,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ============================================================
// Repair trigger — REPAIR_TRIGGER_NEEDS still exported from page-flow
// ============================================================
// Retained as a stable export (deriveRepairBranchActive + legacy consumers).
// The lean Review no longer uses it, but the const + its consumers remain.

describe("REPAIR_TRIGGER_NEEDS — SOT 4-chip set", () => {
  it("contains clarify (a misunderstanding-repair op)", () => {
    expect(REPAIR_TRIGGER_NEEDS).toContain("clarify");
  });

  it("contains apologize, reassure, ask_for_repair", () => {
    expect(REPAIR_TRIGGER_NEEDS).toContain("apologize");
    expect(REPAIR_TRIGGER_NEEDS).toContain("reassure");
    expect(REPAIR_TRIGGER_NEEDS).toContain("ask_for_repair");
  });

  it("does NOT contain set_boundary (different cognitive op: self-protection, not relationship-repair)", () => {
    expect((REPAIR_TRIGGER_NEEDS as readonly string[])).not.toContain("set_boundary");
  });

  it("has exactly 4 chips", () => {
    expect(REPAIR_TRIGGER_NEEDS.length).toBe(4);
  });
});

// ============================================================
// BYS schema — riskContext optional (Coach SOT 2026-05-06)
// ============================================================
const validBysBase = {
  draftText: "Hey, I noticed you went quiet at dinner. Want to talk now?",
  messageType: "check_in" as const,
};

describe("createBeforeYouSendSchema — riskContext", () => {
  it("accepts payload without riskContext", () => {
    const result = createBeforeYouSendSchema.safeParse(validBysBase);
    expect(result.success).toBe(true);
  });

  it("accepts payload with riskContext populated", () => {
    const result = createBeforeYouSendSchema.safeParse({
      ...validBysBase,
      riskContext: "They might read this as pressure if I send it before they're home.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null riskContext", () => {
    const result = createBeforeYouSendSchema.safeParse({
      ...validBysBase,
      riskContext: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects riskContext over 2000 chars", () => {
    const result = createBeforeYouSendSchema.safeParse({
      ...validBysBase,
      riskContext: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
