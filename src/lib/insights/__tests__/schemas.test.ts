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
    confidence: "tentative" as const,
  };

  it("accepts a valid reflection with 2 observations", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Three themes show up across your last four weeks.",
      observations: [validObservation, validObservation],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid reflection with 3 observations", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Three themes show up across your last four weeks.",
      observations: [validObservation, validObservation, validObservation],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a reflection with only 1 observation", () => {
    const result = reflectionOutputSchema.safeParse({
      mode: "reflection",
      summary: "Single theme.",
      observations: [validObservation],
    });
    expect(result.success).toBe(false);
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
        "Not enough entries yet to surface patterns — keep using Coach for another week or two and come back.",
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
