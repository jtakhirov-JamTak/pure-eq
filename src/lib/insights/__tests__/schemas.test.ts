import { describe, it, expect } from "vitest";
import { reflectionOutputSchema } from "@/lib/ai/schemas";

describe("reflectionOutputSchema", () => {
  const validEvidence = {
    quote: "I shut down the moment they raised their voice",
    source_record_id: "11111111-2222-4333-8444-555555555555",
    source_date: "2026-04-20",
  };

  const validObservation = {
    theme: "You pull back when contradicted",
    observation:
      "Across three Reviews, the hardest moment is described as the other person getting louder — and the user's response is almost always to go silent or leave the room. Naming this is the first step to holding presence.",
    evidence: [validEvidence],
    confidence: "early" as const,
  };

  const validFocus = {
    theme: "You pull back when contradicted",
    practice:
      "When a conversation heats up, name the discomfort out loud instead of going quiet.",
    modules: ["review", "prepare"],
  };

  it("accepts a valid reflection with 2 observations", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Three themes show up across your last four weeks.",
      observations: [validObservation, validObservation],
      focus: validFocus,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid reflection with 3 observations", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Three themes show up across your last four weeks.",
      observations: [validObservation, validObservation, validObservation],
      focus: validFocus,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a reflection missing the required focus", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Has observations but no focus.",
      observations: [validObservation, validObservation],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a reflection with 1 observation (v6: single-pattern week)", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Single theme.",
      observations: [validObservation],
      focus: validFocus,
    });
    expect(result.success).toBe(true);
  });

  it("keeps a well-formed focus_followup", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "One pattern.",
      observations: [validObservation],
      focus: validFocus,
      focus_followup: {
        prior_theme: "You pull back when contradicted",
        took_action: true,
        note: "You ran two Reviews this week that touched the focus.",
      },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.mode === "reflection") {
      expect(result.data.focus_followup?.took_action).toBe(true);
    }
  });

  it("coerces a malformed focus_followup to null instead of rejecting (server rebuilds it)", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "One pattern.",
      observations: [validObservation],
      focus: validFocus,
      // took_action stringly-typed — the server overwrites it anyway, so this
      // must NOT reject the whole reflection.
      focus_followup: { prior_theme: "X", took_action: "yes", note: "n" },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.mode === "reflection") {
      expect(result.data.focus_followup).toBeNull();
    }
  });

  it("rejects a reflection with 4 observations", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Four themes.",
      observations: Array(4).fill(validObservation),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an observation with zero evidence items", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [
        { ...validObservation, evidence: [] },
        validObservation,
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an observation with 4+ evidence items", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [
        { ...validObservation, evidence: Array(4).fill(validEvidence) },
        validObservation,
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a source_date that is not YYYY-MM-DD", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [
        {
          ...validObservation,
          evidence: [{ ...validEvidence, source_date: "April 20, 2026" }],
        },
        validObservation,
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a source_record_id that is not a UUID", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [
        {
          ...validObservation,
          evidence: [{ ...validEvidence, source_record_id: "not-a-uuid" }],
        },
        validObservation,
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a confidence value outside the enum", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [
        { ...validObservation, confidence: "certain" },
        validObservation,
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects the retired 'tentative' confidence value", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [
        { ...validObservation, confidence: "tentative" },
        validObservation,
      ],
    });
    expect(result.success).toBe(false);
  });

  it("defaults counter_evidence to [] when omitted", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [validObservation, validObservation],
      focus: validFocus,
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.mode === "reflection") {
      expect(result.data.observations[0].counter_evidence).toEqual([]);
    }
  });

  it("defaults focus_followup to null when omitted", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [validObservation, validObservation],
      focus: validFocus,
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.mode === "reflection") {
      expect(result.data.focus_followup).toBeNull();
    }
  });

  it("rejects a focus with an invalid module value", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [validObservation, validObservation],
      focus: { ...validFocus, modules: ["journaling"] },
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid counter_evidence items", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [
        { ...validObservation, counter_evidence: [validEvidence] },
        validObservation,
      ],
      focus: validFocus,
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 3 counter_evidence items", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [
        { ...validObservation, counter_evidence: Array(4).fill(validEvidence) },
        validObservation,
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects theme/observation/quote whitespace-only strings", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Summary.",
      observations: [
        { ...validObservation, theme: "   " },
        validObservation,
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid refusal shape via the discriminated union", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "refusal",
      refusal_reason: "out_of_scope",
      message_to_user:
        "Not enough entries yet to surface patterns — keep using Coach and Tools for another week or two and come back.",
      suggested_resource: "none",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a safety-trigger refusal with a crisis resource", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "refusal",
      refusal_reason: "safety_concern",
      message_to_user:
        "I'm concerned by what you described. Please call or text 988 — that's the Suicide and Crisis Lifeline, available any time.",
      suggested_resource: "988",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown mode value", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "summary",
      summary: "Summary.",
      observations: [validObservation, validObservation],
    });
    expect(result.success).toBe(false);
  });
});
