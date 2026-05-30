import { describe, it, expect } from "vitest";
import { buildReviewPrompt, PROMPT_VERSION } from "../prompts";

// Lean Review (coins redesign 2026-05-29). buildReviewPrompt is now a tier-aware
// 7-field builder: turning_point / pattern_data / recommended_move on Quick,
// plus their_likely_experience / repeat_stop_update on Deep. The Prepare→Review
// calibration prepend is preserved.
const baseParams = {
  profile: "reflective" as const,
  tier: "quick" as const,
  whatHappened: "We argued about dinner plans.",
  observedRaw: "they raised their voice and walked to the kitchen",
  interpretedRaw: "I read it as them shutting the conversation down",
  whatYouDid: "went quiet",
  easierOrHarder: "made it harder for them to circle back",
  dataAndUpdate: "pushing freezes info; ask what they need before naming my read",
  nextMove: "repair",
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
  });

  it("does NOT render a relationship-only line if name is missing", () => {
    const out = buildReviewPrompt({
      ...baseParams,
      personName: null,
      personRelationship: "partner",
    });
    expect(out.user).not.toContain("Person:");
  });

  it("stamps the current PROMPT_VERSION constant", () => {
    const out = buildReviewPrompt(baseParams);
    expect(out.prompt_version).toBe(PROMPT_VERSION);
  });
});

describe("buildReviewPrompt — lean fields + tiering", () => {
  it("renders all 7 lean inputs verbatim in the user block", () => {
    const out = buildReviewPrompt(baseParams);
    expect(out.user).toContain("We argued about dinner plans.");
    expect(out.user).toContain("they raised their voice and walked to the kitchen");
    expect(out.user).toContain("I read it as them shutting the conversation down");
    expect(out.user).toContain("went quiet");
    expect(out.user).toContain("made it harder for them to circle back");
    expect(out.user).toContain("pushing freezes info");
    expect(out.user).toContain("repair");
  });

  it("Quick tier instructs the model to return ONLY the 3 Quick cards", () => {
    const out = buildReviewPrompt({ ...baseParams, tier: "quick" });
    expect(out.system).toContain("turning_point");
    expect(out.system).toContain("pattern_data");
    expect(out.system).toContain("recommended_move");
    // The Deep card SCHEMA DEFINITIONS must be absent — only the "do NOT
    // include" guard line names the Deep keys on Quick.
    expect(out.system).not.toContain("best behavior-grounded read");
    expect(out.system).not.toContain("one thing to repeat, one to stop");
    expect(out.system).toContain(
      "do NOT include their_likely_experience or repeat_stop_update",
    );
  });

  it("Deep tier adds the 2 Deep cards to the schema block", () => {
    const out = buildReviewPrompt({ ...baseParams, tier: "deep" });
    expect(out.system).toContain("their_likely_experience");
    expect(out.system).toContain("repeat_stop_update");
    expect(out.user).toContain(
      "also return their_likely_experience and repeat_stop_update",
    );
  });
});

describe("buildReviewPrompt — calibration prepend", () => {
  const snapshot = {
    situation: "the overdue budget report",
    predictedReaction: "They'll likely go quiet and stop explaining.",
    primaryEmotion: "frustrated",
    defaultPattern: "I push to resolve fast",
    neutralCheckQuestion: "What's making this one hard to land?",
    opener: "Hey, got ten minutes to sort the report?",
    emotionAsData: null,
    hiddenExpectation: null,
    specificShift: null,
    outcomeFloor: null,
  };

  it("renders the forecast block when a linked Prepare snapshot is present", () => {
    const out = buildReviewPrompt({
      ...baseParams,
      linkedPrepareEntryId: "11111111-1111-1111-1111-111111111111",
      prepareSnapshot: snapshot,
    });
    expect(out.user).toContain("YOUR FORECAST");
    expect(out.user).toContain("They'll likely go quiet and stop explaining.");
    expect(out.user).toContain("Use the forecast block above");
  });

  it("omits the forecast block when there is no link", () => {
    const out = buildReviewPrompt(baseParams);
    expect(out.user).not.toContain("YOUR FORECAST");
  });

  it("omits the forecast block when an id is present but no snapshot", () => {
    const out = buildReviewPrompt({
      ...baseParams,
      linkedPrepareEntryId: "11111111-1111-1111-1111-111111111111",
      prepareSnapshot: null,
    });
    expect(out.user).not.toContain("YOUR FORECAST");
  });
});
