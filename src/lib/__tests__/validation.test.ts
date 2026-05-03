import { describe, it, expect } from "vitest";
import {
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
