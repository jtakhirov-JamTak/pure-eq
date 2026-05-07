import { describe, it, expect } from "vitest";
import {
  buildPreparePrompt,
  buildPulseCheckPrompt,
  PROMPT_VERSION,
} from "../prompts";

const baseParams = {
  profile: "reflective" as const,
  personName: "Alex",
  relationship: "partner",
  situation: "How we split chores at home.",
  emotionAsData: "Resentment — pointing at unfairness this month.",
  observedFromThem: "They sigh when I bring it up and change the subject.",
  theirStateHedged: "They might be running on empty.",
  fairestVersion: "Picking up overtime, not dodging on purpose.",
  predictedReaction: "If I open with stats, they'll go quiet.",
  hiddenExpectation: "Hoping they'll volunteer to take over the dishes.",
  specificShift: "A standing rotation on the calendar.",
  outcomeFloor: "Name that this keeps coming back.",
  opener: "Hey, can we talk about how we split things up?",
  bodyLocation: "chest",
  triggerPlan: "If I feel chest-tightening, I'll pause and ask one question.",
};

describe("buildPreparePrompt — Coach SOT shape", () => {
  it("stamps PROMPT_VERSION = 5.0.0", () => {
    const out = buildPreparePrompt(baseParams);
    expect(out.prompt_version).toBe("5.0.0");
    expect(PROMPT_VERSION).toBe("5.0.0");
  });

  it("includes the PREPARE OPENER RULE in the system prompt", () => {
    const out = buildPreparePrompt(baseParams);
    expect(out.system).toContain("PREPARE OPENER RULE");
    expect(out.system).toContain("PRESSURE patterns");
    expect(out.system).toContain("BLAME patterns");
  });

  it("renders all 14 SOT fields verbatim in the user block", () => {
    const out = buildPreparePrompt(baseParams);
    expect(out.user).toContain("Alex (partner)");
    expect(out.user).toContain("How we split chores at home.");
    expect(out.user).toContain("Resentment — pointing at unfairness this month.");
    expect(out.user).toContain(
      "They sigh when I bring it up and change the subject.",
    );
    expect(out.user).toContain("They might be running on empty.");
    expect(out.user).toContain("Picking up overtime, not dodging on purpose.");
    expect(out.user).toContain("If I open with stats, they'll go quiet.");
    expect(out.user).toContain(
      "Hoping they'll volunteer to take over the dishes.",
    );
    expect(out.user).toContain("A standing rotation on the calendar.");
    expect(out.user).toContain("Name that this keeps coming back.");
    expect(out.user).toContain(
      "Hey, can we talk about how we split things up?",
    );
    expect(out.user).toContain("chest");
    expect(out.user).toContain(
      "If I feel chest-tightening, I'll pause and ask one question.",
    );
  });
});

describe("buildPulseCheckPrompt", () => {
  const pulseBase = {
    profile: "reflective" as const,
    personName: "Sam",
    relationship: "partner",
    whatFeelsOff: "Quieter than usual the past few days.",
    whatChangedAndBefore:
      "Last weekend we were laughing; now short replies.",
    whenItShifted: "Sometime after Sunday brunch.",
    feelingText: "Tight chest, slight dread.",
    bodyLocation: "chest",
    theirsNotAboutYou: "They started a new job — could be load not me.",
    story: "I'm being avoided.",
    alternative:
      "They're tapped out by work and going quiet across the board.",
    signalNoiseObservation:
      "If they're still terse by Friday, it's signal.",
    nextMoveChip: "wait_observe",
    lightCheckQuestion: null,
  };

  it("includes the PULSE CHECK RULE in the system prompt", () => {
    const out = buildPulseCheckPrompt(pulseBase);
    expect(out.system).toContain("PULSE CHECK RULE");
    expect(out.system).toContain("early-detection coaching");
  });

  it("omits the lightCheckQuestion line when null", () => {
    const out = buildPulseCheckPrompt(pulseBase);
    expect(out.user).not.toContain("Light check-in question");
  });

  it("renders the lightCheckQuestion line when populated", () => {
    const out = buildPulseCheckPrompt({
      ...pulseBase,
      nextMoveChip: "ask_clarifying",
      lightCheckQuestion:
        "Hey, all good? You've been quiet — anything I should know?",
    });
    expect(out.user).toContain("Light check-in question");
    expect(out.user).toContain("anything I should know?");
  });

  it("stamps PROMPT_VERSION = 5.0.0", () => {
    const out = buildPulseCheckPrompt(pulseBase);
    expect(out.prompt_version).toBe("5.0.0");
  });
});
