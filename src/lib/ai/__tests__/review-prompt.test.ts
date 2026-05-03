import { describe, it, expect } from "vitest";
import { buildReviewPrompt, PROMPT_VERSION } from "../prompts";

const baseParams = {
  profile: "reflective" as const,
  whatHappened: "We argued about dinner plans.",
  observedRaw: "they raised their voice and walked to the kitchen",
  interpretedRaw: "I read it as them shutting the conversation down",
  hardestMomentFeeling: "shut down",
  whatYouDid: "went quiet",
  observedInThem: "they kept pushing for an answer",
  theirExperience: "felt unheard",
  whatYouAvoided: "naming that I needed a break",
  askBeforeUnderstanding: "no" as const,
  needsToHappenNext: "clarify" as const,
  repairBranchActive: false,
};

describe("buildReviewPrompt — person line rendering", () => {
  it("renders 'Person: {name} ({relationship})' when both fields present", () => {
    const out = buildReviewPrompt({
      ...baseParams,
      personName: "Jessie",
      personRelationship: "partner",
    });
    expect(out.user).toContain("Person: Jessie (partner)");
  });

  it("omits the person line entirely when both fields are null", () => {
    const out = buildReviewPrompt({
      ...baseParams,
      personName: null,
      personRelationship: null,
    });
    expect(out.user).not.toContain("Person:");
    expect(out.user).not.toContain("Person relationship:");
  });

  it("omits the person line when both fields are undefined (legacy callers)", () => {
    // Backwards-compat: a caller that doesn't pass the new params at all
    // should produce a prompt byte-identical to pre-4.1.0 (no person line).
    const out = buildReviewPrompt(baseParams);
    expect(out.user).not.toContain("Person:");
  });

  it("does NOT render a relationship-only line if name is missing", () => {
    // Defends the simplification at prompts.ts — the run-module fetch
    // populates both fields together, so this state shouldn't reach the
    // builder. If it ever does (legacy row, schema drift), we render
    // nothing rather than a half-shape "Person relationship:" line that
    // would imply a meaningful intermediate state.
    const out = buildReviewPrompt({
      ...baseParams,
      personName: null,
      personRelationship: "partner",
    });
    expect(out.user).not.toContain("Person:");
    expect(out.user).not.toContain("Person relationship:");
  });

  it("stamps the current PROMPT_VERSION constant", () => {
    const out = buildReviewPrompt({
      ...baseParams,
      personName: "Jessie",
      personRelationship: "partner",
    });
    expect(out.prompt_version).toBe(PROMPT_VERSION);
  });
});
