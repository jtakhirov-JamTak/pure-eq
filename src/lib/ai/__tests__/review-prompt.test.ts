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

// SOT 2026-05-08 Commit 5: new Full Review SOT inputs surface in the
// user block + card-derivation guidance attaches to the system prompt.
describe("buildReviewPrompt — SOT 2026-05-08 Full inputs", () => {
  const sotFull = {
    ...baseParams,
    reviewDepth: "full" as const,
    feltAtHardestMoment: "Pinned. Like the floor moved.",
    bodyLocation: "chest",
    feelingTracking: "Yes — they'd already been pulling away all week.",
    easierOrHarder: "Made it harder for them to bring this up later.",
    treatAsData: "The pause after 'I don't know what you want' was the real answer.",
    somethingThatHelped: "When I stopped pushing and asked what they needed.",
    theirInMomentExperience: "Cornered. Trying not to escalate.",
    signsHowTheyLeft: "Closed laptop, said 'I'm going to bed' without eye contact.",
    turningPoint: "When I said 'fine, forget it' — that's when their tone hardened.",
    lessonScreen: {
      a: "Push doesn't surface info — it freezes it.",
      b: "Ask what they need before naming what I see.",
      c: null,
    },
  };

  it("renders all 9 new SOT fields verbatim in the user block", () => {
    const out = buildReviewPrompt(sotFull);
    expect(out.user).toContain("Pinned. Like the floor moved.");
    expect(out.user).toContain("(body: chest)");
    expect(out.user).toContain(
      "they'd already been pulling away all week.",
    );
    expect(out.user).toContain(
      "Made it harder for them to bring this up later.",
    );
    expect(out.user).toContain(
      "The pause after 'I don't know what you want' was the real answer.",
    );
    expect(out.user).toContain(
      "When I stopped pushing and asked what they needed.",
    );
    expect(out.user).toContain("Cornered. Trying not to escalate.");
    expect(out.user).toContain("Closed laptop");
    expect(out.user).toContain("that's when their tone hardened.");
    expect(out.user).toContain("Push doesn't surface info");
    expect(out.user).toContain("what they need before naming what I see");
  });

  it("omits optional lessonScreen sub-fields when null", () => {
    const out = buildReviewPrompt(sotFull);
    // c is null in sotFull — render should NOT include the c-clause segment.
    expect(out.user).not.toContain("what they'll carry forward:");
    // b is non-null — should render.
    expect(out.user).toContain("what they'd do differently:");
  });

  it("attaches Full-Review card-derivation guidance to the trailing instruction", () => {
    const out = buildReviewPrompt(sotFull);
    expect(out.user).toContain("CARD DERIVATIONS");
    expect(out.user).toContain("treat_as_data");
    expect(out.user).toContain("alternative_explanation");
    expect(out.user).toContain("easier_or_harder");
    expect(out.user).toContain("impact_vs_intent");
    expect(out.user).toContain("signs_how_they_left");
    expect(out.user).toContain("how_you_came_across");
    expect(out.user).toContain("turning_point");
    expect(out.user).toContain("question_you_missed");
  });

  it("DOES NOT attach card-derivation guidance on Quick depth", () => {
    const out = buildReviewPrompt({
      ...baseParams,
      reviewDepth: "quick",
    });
    expect(out.user).not.toContain("CARD DERIVATIONS");
    expect(out.user).toContain("Quick depth");
  });
});
