import { describe, it, expect } from "vitest";
import { buildFocusFollowup } from "../generate";

const priorFocus = { theme: "You pull back when contradicted" };

describe("buildFocusFollowup — server-authoritative took_action", () => {
  it("sets took_action true when there was ANY activity (≥1 entry)", () => {
    const out = buildFocusFollowup(priorFocus, 1, "You ran two Before-You-Send checks.");
    expect(out.took_action).toBe(true);
    expect(out.prior_theme).toBe(priorFocus.theme);
  });

  it("sets took_action false when there was zero activity", () => {
    const out = buildFocusFollowup(priorFocus, 0, null);
    expect(out.took_action).toBe(false);
  });

  it("keeps the model's note when present (trimmed)", () => {
    const out = buildFocusFollowup(priorFocus, 3, "  You leaned into Review twice.  ");
    expect(out.note).toBe("You leaned into Review twice.");
  });

  it("falls back to a positive note when the model omitted one but there was activity", () => {
    const out = buildFocusFollowup(priorFocus, 2, null);
    expect(out.note.length).toBeGreaterThan(0);
    expect(out.took_action).toBe(true);
  });

  it("falls back to an encouraging note when there was no activity and no model note", () => {
    const out = buildFocusFollowup(priorFocus, 0, "   ");
    expect(out.note.length).toBeGreaterThan(0);
    expect(out.took_action).toBe(false);
  });

  it("copies the prior theme verbatim into prior_theme", () => {
    const out = buildFocusFollowup({ theme: "A different theme" }, 0, "note");
    expect(out.prior_theme).toBe("A different theme");
  });
});
