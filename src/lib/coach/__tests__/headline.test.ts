import { describe, it, expect } from "vitest";
import { extractHeadline } from "@/lib/coach/conversation-summary";

// The 6.5.0 Prepare output redesign moved pressure_check to Deep-only, so the
// denormalized ai_headline must come from conversation_mode (a Quick card) with
// a pressure_check fallback for pre-redesign rows. A blank headline here means a
// missing "Coach" line across the Conversations list/timeline.
describe("extractHeadline — prepare headline field (6.5.0)", () => {
  it("uses conversation_mode for a v10 Quick prepare (no pressure_check)", () => {
    expect(
      extractHeadline("prepare", {
        mode: "normal",
        conversation_mode: "Really Align + Connect. The danger: pushing too fast.",
        hot_layer: "x",
      }),
    ).toBe("Really Align + Connect. The danger: pushing too fast.");
  });

  it("falls back to pressure_check for a pre-redesign prepare row", () => {
    expect(
      extractHeadline("prepare", {
        mode: "normal",
        pressure_check: "Don't open with 'we need to talk.'",
      }),
    ).toBe("Don't open with 'we need to talk.'");
  });

  it("prefers conversation_mode over pressure_check when both present (Deep)", () => {
    expect(
      extractHeadline("prepare", {
        mode: "normal",
        conversation_mode: "Mode line.",
        pressure_check: "Pressure line.",
      }),
    ).toBe("Mode line.");
  });

  it("returns message_to_user for a refusal", () => {
    expect(
      extractHeadline("prepare", {
        mode: "refusal",
        message_to_user: "Please reach out to 988.",
      }),
    ).toBe("Please reach out to 988.");
  });

  it("returns null when neither headline field is a non-empty string", () => {
    expect(
      extractHeadline("prepare", { mode: "normal", conversation_mode: "   " }),
    ).toBe(null);
  });
});
