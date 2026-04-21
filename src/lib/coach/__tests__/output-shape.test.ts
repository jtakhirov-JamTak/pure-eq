import { describe, it, expect } from "vitest";
import { isLegacyV1, isRefusal } from "@/lib/coach/output-shape";

// A realistic legacy-v1 Prepare output. No `mode` discriminator; only
// the per-module coaching fields.
const legacyV1Prepare = {
  reality_check_question: "What is the outcome you want from this?",
  thing_not_to_do: "Don't open with 'we need to talk.'",
  best_next_move: "Lead with a concrete question about the project scope.",
  pattern_tag: "defended_intent_early",
};

// Realistic refusal output per refusalShape (Coach v2 commit 1).
const refusal = {
  mode: "refusal",
  refusal_reason: "safety_concern",
  message_to_user:
    "This sounds serious. Please reach out to 988 — the Suicide & Crisis Lifeline — right now.",
  suggested_resource: "988",
};

// A forward-looking v2-normal sample. The commit 1 schemas don't yet
// carry `mode: "normal"` — that lands in the wiring commit — but the
// guards must already classify it correctly (not legacy v1, not a
// refusal) so the renderer fallthrough works the moment the schema
// flips.
const v2Normal = {
  mode: "normal",
  reality_check_question: "What would 'good enough' look like to you?",
  thing_not_to_do: "Don't lead with the list of grievances.",
  best_next_move: "Open by naming your own intent for the conversation.",
  pattern_tag: "defended_intent_early",
};

describe("isLegacyV1", () => {
  it("accepts a legacy v1 coaching output", () => {
    expect(isLegacyV1(legacyV1Prepare)).toBe(true);
  });

  it("rejects a refusal object (has mode)", () => {
    expect(isLegacyV1(refusal)).toBe(false);
  });

  it("rejects a v2-normal object (has mode)", () => {
    expect(isLegacyV1(v2Normal)).toBe(false);
  });

  it("rejects malformed inputs", () => {
    expect(isLegacyV1(null)).toBe(false);
    expect(isLegacyV1(undefined)).toBe(false);
    expect(isLegacyV1("string")).toBe(false);
    expect(isLegacyV1(42)).toBe(false);
  });
});

describe("isRefusal", () => {
  it("accepts a valid refusal object", () => {
    expect(isRefusal(refusal)).toBe(true);
  });

  it("rejects a legacy v1 coaching output", () => {
    expect(isRefusal(legacyV1Prepare)).toBe(false);
  });

  it("rejects a v2-normal object", () => {
    expect(isRefusal(v2Normal)).toBe(false);
  });

  it("rejects a refusal-shaped object with an invalid enum value", () => {
    const badResource = { ...refusal, suggested_resource: "911" };
    expect(isRefusal(badResource)).toBe(false);
  });

  it("rejects malformed inputs", () => {
    expect(isRefusal(null)).toBe(false);
    expect(isRefusal(undefined)).toBe(false);
    expect(isRefusal({})).toBe(false);
    expect(isRefusal("string")).toBe(false);
  });
});
