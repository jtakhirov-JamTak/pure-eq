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
    expect(PROMPT_VERSION).toBe("6.3.0");
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

describe("buildPulseCheckPrompt — lean tiered shape", () => {
  const pulseBase = {
    profile: "reflective" as const,
    tier: "quick" as const,
    personName: "Sam",
    personRelationship: "partner",
    whatFeelsOff: "Quieter than usual the past few days.",
    whatChangedVsBefore:
      "Last weekend we were laughing; now short replies.",
    story: "I'm being avoided.",
    alternative:
      "They're tapped out by work and going quiet across the board.",
    signalTestConfirm: "If they're still terse by Friday, it's signal.",
    signalTestDisconfirm: "If they warm up after the deadline, it's noise.",
    nextMove: "observe",
    checkWindow: "3d",
    lightCheckQuestion: null,
  };

  it("includes the PULSE CHECK RULE in the system prompt", () => {
    const out = buildPulseCheckPrompt(pulseBase);
    expect(out.system).toContain("PULSE CHECK RULE");
    expect(out.system).toContain("early-detection coaching");
  });

  it("renders both sides of the two-sided signal test", () => {
    const out = buildPulseCheckPrompt(pulseBase);
    expect(out.user).toContain("what would CONFIRM this is real signal");
    expect(out.user).toContain("what would DISCONFIRM it");
    expect(out.user).toContain("terse by Friday");
    expect(out.user).toContain("warm up after the deadline");
  });

  it("renders the observation window line when checkWindow is set", () => {
    const out = buildPulseCheckPrompt(pulseBase);
    expect(out.user).toContain("Observation window they chose: 3d");
  });

  it("omits the lightCheckQuestion line when null", () => {
    const out = buildPulseCheckPrompt(pulseBase);
    expect(out.user).not.toContain("Light check-in question");
  });

  it("renders the lightCheckQuestion line when populated", () => {
    const out = buildPulseCheckPrompt({
      ...pulseBase,
      nextMove: "ask_light",
      checkWindow: null,
      lightCheckQuestion:
        "Hey, all good? You've been quiet — anything I should know?",
    });
    expect(out.user).toContain("Light check-in question");
    expect(out.user).toContain("anything I should know?");
  });

  it("Quick tier omits the Deep cards and instructs to return only Quick", () => {
    const out = buildPulseCheckPrompt(pulseBase);
    expect(out.system).not.toContain('"stop_checking_rule"');
    expect(out.system).not.toContain('"pattern_projection_risk"');
    expect(out.system).toContain("Return ONLY the Quick fields");
  });

  it("Deep tier includes the two Deep cards", () => {
    const out = buildPulseCheckPrompt({ ...pulseBase, tier: "deep" });
    expect(out.system).toContain('"stop_checking_rule"');
    expect(out.system).toContain('"pattern_projection_risk"');
    expect(out.user).toContain(
      "also return stop_checking_rule and pattern_projection_risk",
    );
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
