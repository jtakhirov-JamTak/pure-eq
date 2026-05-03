import { describe, it, expect } from "vitest";
import { createReviewSchema } from "@/lib/validation";

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
