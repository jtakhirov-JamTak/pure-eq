import { describe, it, expect } from "vitest";
import {
  buildPreparePrompt,
  buildPulseCheckPrompt,
  PROMPT_VERSION,
} from "../prompts";

// Prepare redesign 2026-06-13: 10-screen flow, conversation-type primary +
// optional secondary, three new reflective inputs, Quick/Deep tier.
const baseParams = {
  profile: "reflective" as const,
  tier: "quick" as const,
  personName: "Alex",
  relationship: "romantic",
  conversationTypePrimary: "align",
  conversationTypeSecondary: "connect" as string | null,
  situation: "How we split chores at home.",
  feelingAndWhy:
    "I feel resentful because it keeps landing on me; it matters because it says I'm not a real partner.",
  myPattern: "I go quiet and keep score instead of saying it out loud.",
  fairestVersion: "Picking up overtime, not dodging on purpose.",
  theirFeelingWant:
    "They probably feel stretched and want credit for the overtime.",
  hiddenAskAndFloor:
    "Hoping they'll take over the dishes; floor is naming it keeps recurring.",
  opener: "Hey, can we talk about how we split things up?",
  triggerPlan: "If I feel chest-tightening, I'll pause and ask one question.",
};

describe("buildPreparePrompt — framing-card output (6.5.0 redesign)", () => {
  it("stamps the current PROMPT_VERSION constant", () => {
    const out = buildPreparePrompt(baseParams);
    expect(out.prompt_version).toBe(PROMPT_VERSION);
    expect(PROMPT_VERSION).toBe("6.5.1");
  });

  it("includes the empathic-accuracy rule (other-person read = inference) in both tiers", () => {
    const quick = buildPreparePrompt(baseParams);
    const deep = buildPreparePrompt({ ...baseParams, tier: "deep" });
    expect(quick.system).toContain("READING THE OTHER PERSON");
    expect(quick.system).toContain("USER'S INFERENCE");
    expect(deep.system).toContain("READING THE OTHER PERSON");
  });

  it("Deep-gates the PREPARE OPENER RULE (Quick has no pressure_check card)", () => {
    const quick = buildPreparePrompt(baseParams);
    expect(quick.system).not.toContain("PREPARE OPENER RULE");
    const deep = buildPreparePrompt({ ...baseParams, tier: "deep" });
    expect(deep.system).toContain("PREPARE OPENER RULE");
    expect(deep.system).toContain("PRESSURE patterns");
    expect(deep.system).toContain("BLAME patterns");
  });

  it("renders all redesign inputs verbatim in the user block", () => {
    const out = buildPreparePrompt(baseParams);
    expect(out.user).toContain("Alex (romantic)");
    // Conversation type renders the gloss for primary + secondary.
    expect(out.user).toContain("Align — expectations change");
    expect(out.user).toContain("secondary: Connect — feelings change");
    expect(out.user).toContain("How we split chores at home.");
    expect(out.user).toContain(
      "I feel resentful because it keeps landing on me",
    );
    expect(out.user).toContain("I go quiet and keep score");
    expect(out.user).toContain("Picking up overtime, not dodging on purpose.");
    expect(out.user).toContain("They probably feel stretched and want credit");
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

  it("omits the secondary gloss when only a primary outcome is picked", () => {
    const out = buildPreparePrompt({
      ...baseParams,
      conversationTypeSecondary: null,
    });
    expect(out.user).toContain("Align — expectations change");
    expect(out.user).not.toContain("secondary:");
  });

  it("Quick tier emits the 6 framing cards and omits the original 5", () => {
    const out = buildPreparePrompt(baseParams);
    // 6 framing cards present in both tiers.
    expect(out.system).toContain('"conversation_mode":');
    expect(out.system).toContain('"classified_primary":');
    expect(out.system).toContain('"classified_secondary":');
    expect(out.system).toContain('"hot_layer":');
    expect(out.system).toContain('"goal_gap":');
    expect(out.system).toContain('"posture":');
    expect(out.system).toContain('"do_dont":');
    expect(out.system).toContain('"carry_in":');
    expect(out.system).toContain("Return ONLY the fields above");
    // The original 5 card DEFINITIONS are absent in Quick.
    expect(out.system).not.toContain('"pressure_check":');
    expect(out.system).not.toContain('"cleaner_opener":');
    expect(out.system).not.toContain('"predicted_reaction":');
    expect(out.system).not.toContain('"neutral_check_question":');
    expect(out.system).not.toContain('"deeper_read":');
  });

  it("Deep tier adds the original 5 card definitions on top of the framing cards", () => {
    const out = buildPreparePrompt({ ...baseParams, tier: "deep" });
    expect(out.system).toContain('"conversation_mode":');
    expect(out.system).toContain('"pressure_check":');
    expect(out.system).toContain('"cleaner_opener":');
    expect(out.system).toContain('"predicted_reaction":');
    expect(out.system).toContain('"neutral_check_question":');
    expect(out.system).toContain('"deeper_read":');
    expect(out.system).not.toContain("Return ONLY the fields above");
    expect(out.user).toContain("Deep request");
  });

  it("lists the CONVERSATION_TYPES enum for the classification fields", () => {
    const out = buildPreparePrompt(baseParams);
    expect(out.system).toContain("classified_primary and classified_secondary");
    expect(out.system).toContain("understand, decide, connect, align");
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
