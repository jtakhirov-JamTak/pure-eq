import { describe, it, expect } from "vitest";
import {
  createBeforeYouSendSchema,
  createPulseCheckSchema,
  createReviewSchema,
  prepareSchemaPathA,
  prepareSchemaPathB,
} from "@/lib/validation";

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
// Prepare Path B — signalNoiseObservation
// (cross-eval batch #1, 2026-05-03)
// ============================================================
const validPathBBase = {
  path: "path_b" as const,
  personName: "Alex",
  relationship: "partner" as const,
  whatFeelsOff: "We've been distant for the past week.",
  whatChanged: "They stopped initiating texts during the day.",
  storyTellingYourself: "I'm telling myself they're losing interest.",
  afraidItMeans: "I'm afraid this means they're checking out.",
  signalNoiseObservation:
    "If they don't initiate a substantive conversation in 5 days, that's signal.",
  realityCheckQuestion: "Has anything else changed for them recently?",
  triggerPlan: "If I notice myself spiraling, I will go for a walk first.",
};

describe("prepareSchemaPathB — signalNoiseObservation", () => {
  it("accepts a Path B payload with the field populated", () => {
    const result = prepareSchemaPathB.safeParse(validPathBBase);
    expect(result.success).toBe(true);
  });

  it("rejects an empty signalNoiseObservation", () => {
    const result = prepareSchemaPathB.safeParse({
      ...validPathBBase,
      signalNoiseObservation: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing signalNoiseObservation", () => {
    const { signalNoiseObservation: _, ...rest } = validPathBBase;
    void _;
    const result = prepareSchemaPathB.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects signalNoiseObservation over 1000 chars", () => {
    const result = prepareSchemaPathB.safeParse({
      ...validPathBBase,
      signalNoiseObservation: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("Path A schema does not require signalNoiseObservation", () => {
    const result = prepareSchemaPathA.safeParse({
      path: "path_a",
      personName: "Alex",
      relationship: "partner",
      situation: "Quarterly review conversation.",
      primaryEmotion: "Anxious about how this will land.",
      defaultPattern: "I tend to over-explain when I'm anxious.",
      otherPersonHypothesis: "They might be defensive about the numbers.",
      theirNeed: "They want to feel competent.",
      realityCheckQuestion: "What outcome would feel like a win for them?",
      howToMakeThemFeel: "Respected and supported.",
      triggerPlan: "If I get triggered, I'll pause and breathe.",
    });
    expect(result.success).toBe(true);
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
