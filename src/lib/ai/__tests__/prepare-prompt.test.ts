import { describe, it, expect } from "vitest";
import {
  buildPreparePrompt,
  buildPulseCheckPrompt,
  PROMPT_VERSION,
} from "../prompts";

// Coins redesign Slice A 2026-05-29: lean 8-field Prepare + Quick/Deep tier.
const baseParams = {
  profile: "reflective" as const,
  tier: "quick" as const,
  personName: "Alex",
  relationship: "partner",
  conversationMove: "boundary",
  situation: "How we split chores at home.",
  fairestVersion: "Picking up overtime, not dodging on purpose.",
  hiddenAskAndFloor:
    "Hoping they'll take over the dishes; floor is naming it keeps recurring.",
  opener: "Hey, can we talk about how we split things up?",
  triggerPlan: "If I feel chest-tightening, I'll pause and ask one question.",
};

describe("buildPreparePrompt — lean tiered shape", () => {
  it("stamps the current PROMPT_VERSION constant", () => {
    const out = buildPreparePrompt(baseParams);
    expect(out.prompt_version).toBe(PROMPT_VERSION);
    expect(PROMPT_VERSION).toBe("5.1.0");
  });

  it("includes the PREPARE OPENER RULE in the system prompt", () => {
    const out = buildPreparePrompt(baseParams);
    expect(out.system).toContain("PREPARE OPENER RULE");
    expect(out.system).toContain("PRESSURE patterns");
    expect(out.system).toContain("BLAME patterns");
  });

  it("renders all 8 lean fields verbatim in the user block", () => {
    const out = buildPreparePrompt(baseParams);
    expect(out.user).toContain("Alex (partner)");
    expect(out.user).toContain("boundary");
    expect(out.user).toContain("How we split chores at home.");
    expect(out.user).toContain("Picking up overtime, not dodging on purpose.");
    expect(out.user).toContain(
      "Hoping they'll take over the dishes; floor is naming it keeps recurring.",
    );
    expect(out.user).toContain(
      "Hey, can we talk about how we split things up?",
    );
    expect(out.user).toContain(
      "If I feel chest-tightening, I'll pause and ask one question.",
    );
  });

  it("Quick tier omits the two Deep card DEFINITIONS from the output schema", () => {
    const out = buildPreparePrompt(baseParams);
    expect(out.system).toContain("pressure_check");
    expect(out.system).toContain("cleaner_opener");
    expect(out.system).toContain("predicted_reaction");
    expect(out.system).toContain("Return ONLY the Quick fields");
    // The "do NOT include …" instruction line names the fields, so match on
    // the quoted JSON key (the schema definition) — absent in Quick.
    expect(out.system).not.toContain('"neutral_check_question":');
    expect(out.system).not.toContain('"deeper_read":');
  });

  it("Deep tier adds the neutral_check_question + deeper_read definitions", () => {
    const out = buildPreparePrompt({ ...baseParams, tier: "deep" });
    expect(out.system).toContain('"neutral_check_question":');
    expect(out.system).toContain('"deeper_read":');
    expect(out.system).not.toContain("Return ONLY the Quick fields");
    expect(out.user).toContain("Deep request");
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

  it("stamps the current PROMPT_VERSION constant", () => {
    const out = buildPulseCheckPrompt(pulseBase);
    expect(out.prompt_version).toBe(PROMPT_VERSION);
  });

  it("uses the SOT 'equally plausible' framing (not 'more generous')", () => {
    const out = buildPulseCheckPrompt(pulseBase);
    expect(out.user).toContain("equally plausible alternative");
    expect(out.user).not.toContain("more generous alternative");
  });
});
