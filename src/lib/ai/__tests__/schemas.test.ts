import { describe, it, expect } from "vitest";
import { refusalShape } from "@/lib/ai/schemas";

describe("refusalShape", () => {
  it("parses a valid refusal object", () => {
    const valid = {
      mode: "refusal",
      refusal_reason: "safety_concern",
      message_to_user:
        "This sounds serious. Please reach out to 988 — the Suicide & Crisis Lifeline — right now.",
      suggested_resource: "988",
    };

    const result = refusalShape.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects an object missing message_to_user", () => {
    const missingMessage = {
      mode: "refusal",
      refusal_reason: "out_of_scope",
      suggested_resource: "none",
    };

    const result = refusalShape.safeParse(missingMessage);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown refusal_reason", () => {
    const result = refusalShape.safeParse({
      mode: "refusal",
      refusal_reason: "other",
      message_to_user: "Something",
      suggested_resource: "none",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown suggested_resource", () => {
    const result = refusalShape.safeParse({
      mode: "refusal",
      refusal_reason: "safety_concern",
      message_to_user: "Please call for help.",
      suggested_resource: "911",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only message_to_user after trim", () => {
    const result = refusalShape.safeParse({
      mode: "refusal",
      refusal_reason: "out_of_scope",
      message_to_user: "   ",
      suggested_resource: "none",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a message_to_user over 400 chars", () => {
    const result = refusalShape.safeParse({
      mode: "refusal",
      refusal_reason: "safety_concern",
      message_to_user: "a".repeat(401),
      suggested_resource: "988",
    });
    expect(result.success).toBe(false);
  });
});
