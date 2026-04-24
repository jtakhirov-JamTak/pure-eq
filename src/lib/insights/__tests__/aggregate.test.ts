import { describe, it, expect } from "vitest";
import { aggregateBehavioralContext, INPUT_WINDOW_DAYS } from "../generate";

describe("aggregateBehavioralContext", () => {
  it("returns all zeros for empty inputs", () => {
    const ctx = aggregateBehavioralContext([], []);
    expect(ctx.windowDays).toBe(INPUT_WINDOW_DAYS);
    expect(ctx.bys).toEqual({ total: 0, safe: 0, risky: 0, do_not_send: 0 });
    expect(ctx.review.total).toBe(0);
    expect(ctx.review.repair_branch_active).toBe(0);
    expect(ctx.review.no_repair_branch).toBe(0);
    expect(ctx.review.needs_next).toEqual({});
  });

  it("counts BYS verdicts by category", () => {
    const ctx = aggregateBehavioralContext(
      [
        { ai_verdict_json: { verdict: "safe" } },
        { ai_verdict_json: { verdict: "safe" } },
        { ai_verdict_json: { verdict: "risky" } },
        { ai_verdict_json: { verdict: "do_not_send" } },
        { ai_verdict_json: { verdict: "do_not_send" } },
      ],
      [],
    );
    expect(ctx.bys).toEqual({ total: 5, safe: 2, risky: 1, do_not_send: 2 });
  });

  it("excludes unknown BYS verdict strings from counts", () => {
    const ctx = aggregateBehavioralContext(
      [
        { ai_verdict_json: { verdict: "safe" } },
        { ai_verdict_json: { verdict: "unknown_legacy_value" } },
        { ai_verdict_json: null },
        { ai_verdict_json: "not-an-object" },
        { ai_verdict_json: {} },
      ],
      [],
    );
    expect(ctx.bys).toEqual({ total: 1, safe: 1, risky: 0, do_not_send: 0 });
  });

  it("splits reviews by repair_branch_active", () => {
    const ctx = aggregateBehavioralContext(
      [],
      [
        { repair_branch_active: true, needs_to_happen_next: "ask_for_repair" },
        { repair_branch_active: true, needs_to_happen_next: "apologize" },
        { repair_branch_active: false, needs_to_happen_next: "clarify" },
      ],
    );
    expect(ctx.review.total).toBe(3);
    expect(ctx.review.repair_branch_active).toBe(2);
    expect(ctx.review.no_repair_branch).toBe(1);
  });

  it("excludes null needs_to_happen_next from needs_next map but still counts review total", () => {
    const ctx = aggregateBehavioralContext(
      [],
      [
        { repair_branch_active: false, needs_to_happen_next: null },
        { repair_branch_active: false, needs_to_happen_next: "clarify" },
        { repair_branch_active: false, needs_to_happen_next: "clarify" },
        { repair_branch_active: false, needs_to_happen_next: "apologize" },
      ],
    );
    expect(ctx.review.total).toBe(4);
    expect(ctx.review.needs_next).toEqual({ clarify: 2, apologize: 1 });
  });

  it("produces independent bys + review buckets", () => {
    const ctx = aggregateBehavioralContext(
      [{ ai_verdict_json: { verdict: "risky" } }],
      [{ repair_branch_active: true, needs_to_happen_next: "apologize" }],
    );
    expect(ctx.bys.total).toBe(1);
    expect(ctx.bys.risky).toBe(1);
    expect(ctx.review.total).toBe(1);
    expect(ctx.review.repair_branch_active).toBe(1);
    expect(ctx.review.needs_next).toEqual({ apologize: 1 });
  });
});
