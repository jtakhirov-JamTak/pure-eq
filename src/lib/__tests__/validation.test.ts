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
// Pulse Check schema — lean redesign (Slice C1, 2026-05-29)
// ============================================================
const validPulseCheckBase = {
  personName: "Sam",
  whatFeelsOff: "Quieter than usual the past few days.",
  whatChangedVsBefore: "Last weekend we were laughing; now short replies.",
  storyAndAlternative: {
    story: "I'm being avoided.",
    alternative: "They're tapped out by work and going quiet across the board.",
  },
  signalTestConfirm: "If they're still terse by Friday, it's signal.",
  signalTestDisconfirm: "If they warm up after the deadline, it's noise.",
  nextMove: "do_nothing" as const,
};

describe("createPulseCheckSchema (lean)", () => {
  it("accepts a do_nothing payload (no conditionals required)", () => {
    const result = createPulseCheckSchema.safeParse(validPulseCheckBase);
    expect(result.success).toBe(true);
  });

  it("defaults tier to quick when omitted", () => {
    const result = createPulseCheckSchema.safeParse(validPulseCheckBase);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tier).toBe("quick");
  });

  it("requires checkWindow when nextMove is observe", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      nextMove: "observe",
    });
    expect(result.success).toBe(false);
  });

  it("accepts observe with a valid checkWindow", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      nextMove: "observe",
      checkWindow: "3d",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown checkWindow value", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      nextMove: "observe",
      checkWindow: "someday",
    });
    expect(result.success).toBe(false);
  });

  it("requires lightCheckQuestion when nextMove is ask_light", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      nextMove: "ask_light",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ask_light with a non-empty lightCheckQuestion", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      nextMove: "ask_light",
      lightCheckQuestion:
        "Hey, all good? You've been quiet — anything I should know?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown nextMove value", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      nextMove: "spelunk",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty signalTestConfirm", () => {
    const result = createPulseCheckSchema.safeParse({
      ...validPulseCheckBase,
      signalTestConfirm: "",
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
// BYS schema — lean 3-question redesign (Phase 1, 2026-06-01)
// ============================================================
const validBysBase = {
  situationFacts: "She went quiet at dinner after I mentioned the budget.",
  desiredOutcome: "Reopen the talk tonight without it turning into a fight.",
  draftText: "Hey, I noticed you went quiet at dinner. Want to talk now?",
};

describe("createBeforeYouSendSchema — lean 3-question", () => {
  it("accepts the 3 required inputs and defaults messageType to conflict", () => {
    const result = createBeforeYouSendSchema.safeParse(validBysBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messageType).toBe("conflict");
      // tier is clamped to quick regardless of input.
      expect(result.data.tier).toBe("quick");
    }
  });

  it("clamps tier to quick even when the client sends deep", () => {
    const result = createBeforeYouSendSchema.safeParse({
      ...validBysBase,
      tier: "deep",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tier).toBe("quick");
  });

  it("forwards a prefilled messageType (Pulse/Review handoff)", () => {
    const result = createBeforeYouSendSchema.safeParse({
      ...validBysBase,
      messageType: "check_in",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.messageType).toBe("check_in");
  });

  it("rejects a missing situationFacts", () => {
    const { situationFacts: _omit, ...rest } = validBysBase;
    void _omit;
    expect(createBeforeYouSendSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty desiredOutcome", () => {
    const result = createBeforeYouSendSchema.safeParse({
      ...validBysBase,
      desiredOutcome: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty draftText", () => {
    const result = createBeforeYouSendSchema.safeParse({
      ...validBysBase,
      draftText: "",
    });
    expect(result.success).toBe(false);
  });
});
