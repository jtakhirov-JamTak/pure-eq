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

const validReviewBase = {
  whatHappened: "We argued about the timeline for the Q3 plan.",
  observedRaw: "Their voice got quieter, they stopped making eye contact.",
  interpretedRaw: "I thought they were shutting down because I'd pushed too hard.",
  hardestMomentFeeling: "When they said 'never mind' — I felt cornered.",
  whatYouDid: "I kept arguing my point instead of pausing.",
  observedInThem: "Tense shoulders, short answers.",
  theirExperience: "They probably felt steamrolled.",
  whatYouAvoided: "I avoided asking what they actually needed.",
  askBeforeUnderstanding: "no" as const,
  needsToHappenNext: "clarify" as const,
  repairBranchActive: false,
};

// ============================================================
// Review schema — observed/interpreted two-column step
// (cross-eval batch #1, 2026-05-03)
// ============================================================
describe("createReviewSchema — observedRaw / interpretedRaw", () => {
  it("accepts a normal-shape payload with both fields populated", () => {
    const result = createReviewSchema.safeParse(validReviewBase);
    expect(result.success).toBe(true);
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

  it("rejects interpretedRaw over 2000 chars", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      interpretedRaw: "a".repeat(2001),
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
});

// ============================================================
// Prepare — single 14-field SOT schema (Coach SOT 2026-05-06)
// ============================================================
const validPrepareBase = {
  personName: "Alex",
  relationship: "partner" as const,
  situation: "Need to talk about how chores are getting split.",
  // SOT 2026-05-08 Commit 4: primary_emotion + default_pattern +
  // neutral_check_question added; body chip moves off opener onto
  // primary_emotion semantically (column stays body_location).
  primaryEmotion: "Resentment, with a knot of dread under it.",
  bodyLocation: "chest" as const,
  emotionAsData: "Resentment — pointing at unfairness over the last month.",
  defaultPattern: "I go quiet, then come out swinging the third time it comes up.",
  observedFromThem:
    "They sigh when I bring it up and change the subject within a minute.",
  theirStateHedged:
    "They might be already running on empty and reading my raises as criticism.",
  fairestVersion:
    "They've been picking up extra at work and aren't dodging on purpose.",
  predictedReaction:
    "If I open with stats, they'll go quiet and we'll loop back into the same fight.",
  hiddenExpectation:
    "I'm hoping they'll volunteer to take over the dishes without me asking.",
  specificShift:
    "A standing rotation we both put on the calendar for two specific tasks.",
  outcomeFloor:
    "If we don't agree on a rotation tonight, at least name that this keeps coming back.",
  neutralCheckQuestion:
    "What's been eating most of your bandwidth lately — the work crunch or something else?",
  opener: "Hey, can we talk about how we split things up at home?",
  triggerPlan: "If I feel chest-tightening, I'll pause and ask one question.",
};

describe("createPrepareSchema — SOT shape", () => {
  it("accepts a fully-populated SOT payload", () => {
    const result = createPrepareSchema.safeParse(validPrepareBase);
    expect(result.success).toBe(true);
  });

  it("rejects an empty emotionAsData", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      emotionAsData: "",
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

  it("rejects an unknown bodyLocation chip", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      bodyLocation: "fuzzy_cant_tell",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every BODY_LOCATION chip (8 values)", () => {
    const chips = [
      "throat",
      "chest",
      "stomach",
      "jaw",
      "shoulders",
      "face",
      "other",
      "dont_notice",
    ] as const;
    for (const chip of chips) {
      const result = createPrepareSchema.safeParse({
        ...validPrepareBase,
        bodyLocation: chip,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects opener over 1000 chars", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      opener: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty primaryEmotion", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      primaryEmotion: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty defaultPattern", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      defaultPattern: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty neutralCheckQuestion", () => {
    const result = createPrepareSchema.safeParse({
      ...validPrepareBase,
      neutralCheckQuestion: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects omitted primaryEmotion (now required)", () => {
    const { primaryEmotion: _, ...minus } = validPrepareBase;
    const result = createPrepareSchema.safeParse(minus);
    expect(result.success).toBe(false);
  });

  it("rejects omitted defaultPattern (now required)", () => {
    const { defaultPattern: _, ...minus } = validPrepareBase;
    const result = createPrepareSchema.safeParse(minus);
    expect(result.success).toBe(false);
  });

  it("rejects omitted neutralCheckQuestion (now required)", () => {
    const { neutralCheckQuestion: _, ...minus } = validPrepareBase;
    const result = createPrepareSchema.safeParse(minus);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Review Quick shape — SOT 2026-05-08 Commit 2
// ============================================================
// Quick = 5 Qs across 2 pages: personName + whatHappened + observedInterpreted
// on Page 1; whatYouDid + needsAndForecast on Page 2. hardestMomentFeeling
// is NOT collected on Quick. Forecast text persists via the optional
// `forecast` field for the calibration loop.

describe("createReviewSchema — Quick shape (SOT 2026-05-08)", () => {
  const validQuickBase = {
    reviewDepth: "quick" as const,
    whatHappened: "We disagreed about whose turn it was to handle the email.",
    observedRaw: "They paused, then said 'fine, I'll just do it.'",
    interpretedRaw: "I read that as resentment building up again.",
    whatYouDid: "I let it drop instead of asking what they actually meant.",
    needsToHappenNext: "clarify" as const,
    forecast: "If I don't bring it back up by Friday, they'll bring it up sharper.",
    repairBranchActive: false,
  };

  it("accepts a Quick payload with no hardestMomentFeeling", () => {
    const result = createReviewSchema.safeParse(validQuickBase);
    expect(result.success).toBe(true);
  });

  it("accepts a Quick payload with a forecast text", () => {
    const result = createReviewSchema.safeParse(validQuickBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.forecast).toBe(validQuickBase.forecast);
    }
  });

  it("accepts a Quick payload without forecast (legacy compat)", () => {
    const { forecast: _, ...minus } = validQuickBase;
    const result = createReviewSchema.safeParse(minus);
    expect(result.success).toBe(true);
  });

  it("rejects an empty forecast string when provided", () => {
    const result = createReviewSchema.safeParse({
      ...validQuickBase,
      forecast: "",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Review repair branch — secretWant / couldMakeThemFeel deprecation
// (cross-eval batch #1, 2026-05-03)
// ============================================================
describe("createReviewSchema — repair branch (deprecated fields)", () => {
  it("accepts a repair-active payload with only yourPart (the new common case)", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      needsToHappenNext: "apologize",
      repairBranchActive: true,
      yourPart: "I cut them off when they tried to explain.",
    });
    expect(result.success).toBe(true);
  });

  it("still accepts payloads carrying populated secretWant / couldMakeThemFeel (historical-row compat)", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      needsToHappenNext: "apologize",
      repairBranchActive: true,
      yourPart: "I dismissed their concern.",
      secretWant: "I want them to admit they overreacted.",
      couldMakeThemFeel: "Heard and respected.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null secretWant / couldMakeThemFeel", () => {
    const result = createReviewSchema.safeParse({
      ...validReviewBase,
      needsToHappenNext: "apologize",
      repairBranchActive: true,
      yourPart: "I steered the conversation away from their question.",
      secretWant: null,
      couldMakeThemFeel: null,
    });
    expect(result.success).toBe(true);
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
// Review Full shape — SOT 2026-05-08 Commit 5
// ============================================================
describe("createReviewSchema — Full SOT shape", () => {
  const validFullBase = {
    reviewDepth: "full" as const,
    whatHappened: "We argued about how the weekend got planned.",
    observedRaw: "They paused for a long time, then looked at the floor.",
    interpretedRaw: "I read that as them giving up on me explaining.",
    feltAtHardestMoment: "Pinned. Like the floor moved.",
    bodyLocation: "chest" as const,
    feelingTracking: "Yes — they'd already been pulling away.",
    whatYouDid: "Kept arguing my point instead of pausing.",
    easierOrHarder: "Made it harder for them to bring this up later.",
    treatAsData: "The pause after 'I don't know what you want' was real.",
    somethingThatHelped: "When I asked what they actually needed.",
    theirInMomentExperience: "Cornered. Trying not to escalate.",
    signsHowTheyLeft: "Closed laptop, no eye contact.",
    turningPoint: "When I said 'fine, forget it' — tone hardened then.",
    lessonScreen: {
      a: "Push doesn't surface info, it freezes it.",
      b: "Ask what they need before naming what I see.",
      c: null,
    },
    needsToHappenNext: "clarify" as const,
    forecast: "If we don't revisit by Wednesday, they'll bring it up sharper.",
    whatProtecting: { chip: "image" as const, text: null },
    repairBranchActive: false,
  };

  it("accepts a Full payload with all 9 new SOT fields", () => {
    const result = createReviewSchema.safeParse(validFullBase);
    expect(result.success).toBe(true);
  });

  it("accepts a lessonScreen with all 3 sub-fields populated", () => {
    const result = createReviewSchema.safeParse({
      ...validFullBase,
      lessonScreen: {
        a: "Push freezes info.",
        b: "Ask first.",
        c: "Carry: pause before naming.",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a lessonScreen missing required `a`", () => {
    const result = createReviewSchema.safeParse({
      ...validFullBase,
      lessonScreen: { b: "Optional.", c: "Optional." } as unknown as {
        a: string;
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty lessonScreen.a", () => {
    const result = createReviewSchema.safeParse({
      ...validFullBase,
      lessonScreen: { a: "", b: null, c: null },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a Full payload with the standalone-branch fields (no calibration)", () => {
    const { lessonScreen: _ls, ...minus } = validFullBase;
    const result = createReviewSchema.safeParse({
      ...minus,
      lessonScreen: validFullBase.lessonScreen,
      whatElseExplains: "They may have just had a long day at work.",
      whatReadMissed: "I assumed their quiet was about me — could be exhaustion.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown Review bodyLocation chip", () => {
    const result = createReviewSchema.safeParse({
      ...validFullBase,
      bodyLocation: "fuzzy_cant_tell",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a Full payload that still carries deprecated fields (historical-row compat)", () => {
    const result = createReviewSchema.safeParse({
      ...validFullBase,
      hardestMomentFeeling: "shut down",
      observedInThem: "raised voice",
      theirExperience: "felt unheard",
      whatYouAvoided: "naming I needed a break",
      askBeforeUnderstanding: "no",
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// Calibration block — SOT 2026-05-08 Commit 3
// ============================================================
// Storage shape is { compare, shift, floor } jsonb. Schema validates
// non-empty 3-field shape with each value <= 40 chars (chip values are
// short tokens like "about_right", "too_soon"). Chip-id enums live in
// SelectCalibrationChip — schema layer only guarantees shape integrity.

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

  it("rejects an over-40-char value (shape-only guard)", () => {
    const result = calibrationBlockSchema.safeParse({
      compare: "x".repeat(41),
      shift: "yes",
      floor: "yes",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Repair trigger — SOT 2026-05-08 Commit 3 (Change 3.4 verified no-op)
// ============================================================
// The shipped REPAIR_TRIGGER_NEEDS already matches the SOT exactly. This
// test locks that in so a future regression that adds set_boundary or
// drops clarify fails the build instead of changing behavior silently.

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
