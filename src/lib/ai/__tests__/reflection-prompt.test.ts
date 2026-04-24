import { describe, it, expect } from "vitest";
import {
  buildReflectionPrompt,
  isBehavioralContextEmpty,
  type BehavioralContext,
} from "../prompts";

const baseParams = {
  profile: "reflective" as const,
  persons: [{ displayName: "Jessie", relationshipDomain: "partner" }],
  entries: [
    {
      raw_record_id: "r-1",
      record_type: "review",
      created_at: "2026-04-20T12:00:00Z",
      source_date: "2026-04-20",
      person_display_name: "Jessie",
      fields: { whatHappened: "We argued about dinner" },
    },
  ],
};

describe("buildReflectionPrompt", () => {
  it("includes FIELD GLOSSARY in the system prompt", () => {
    const out = buildReflectionPrompt(baseParams);
    expect(out.system).toContain("FIELD GLOSSARY");
    expect(out.system).toContain("path_a");
    expect(out.system).toContain("path_b");
    expect(out.system).toContain("repairBranchActive");
    expect(out.system).toContain("needsToHappenNext");
    expect(out.system).toContain("messageType");
  });

  it("includes the BEHAVIORAL CONTEXT anti-quote rule in system", () => {
    const out = buildReflectionPrompt(baseParams);
    expect(out.system).toContain("BEHAVIORAL CONTEXT");
    expect(out.system).toMatch(/Never cite the counts themselves as evidence/i);
  });

  it("omits the BEHAVIORAL CONTEXT user block when context is absent", () => {
    const out = buildReflectionPrompt(baseParams);
    expect(out.user).not.toContain("BEHAVIORAL CONTEXT over the last");
  });

  it("omits the BEHAVIORAL CONTEXT user block when context is empty", () => {
    const ctx: BehavioralContext = {
      windowDays: 28,
      bys: { total: 0, safe: 0, risky: 0, do_not_send: 0 },
      review: { total: 0, repair_branch_active: 0, no_repair_branch: 0, needs_next: {} },
    };
    const out = buildReflectionPrompt({ ...baseParams, behavioralContext: ctx });
    expect(out.user).not.toContain("BEHAVIORAL CONTEXT over the last");
  });

  it("includes BYS counters when BYS total > 0", () => {
    const ctx: BehavioralContext = {
      windowDays: 28,
      bys: { total: 5, safe: 2, risky: 1, do_not_send: 2 },
      review: { total: 0, repair_branch_active: 0, no_repair_branch: 0, needs_next: {} },
    };
    const out = buildReflectionPrompt({ ...baseParams, behavioralContext: ctx });
    expect(out.user).toContain("BEHAVIORAL CONTEXT over the last 28 days");
    expect(out.user).toContain("Before-You-Send drafts: 5 total");
    expect(out.user).toContain("2 safe");
    expect(out.user).toContain("1 risky");
    expect(out.user).toContain("2 do_not_send");
    expect(out.user).not.toContain("Reviews: 0");
  });

  it("includes Review counters when Review total > 0", () => {
    const ctx: BehavioralContext = {
      windowDays: 28,
      bys: { total: 0, safe: 0, risky: 0, do_not_send: 0 },
      review: {
        total: 3,
        repair_branch_active: 2,
        no_repair_branch: 1,
        needs_next: { ask_for_repair: 2, apologize: 1 },
      },
    };
    const out = buildReflectionPrompt({ ...baseParams, behavioralContext: ctx });
    expect(out.user).toContain("Reviews: 3 total");
    expect(out.user).toContain("2 with repair_branch_active = true");
    expect(out.user).toContain("1 without");
    expect(out.user).toContain("ask_for_repair=2");
    expect(out.user).toContain("apologize=1");
    expect(out.user).not.toContain("Before-You-Send drafts:");
  });

  it("labels the behavioral block as non-quotable framing", () => {
    const ctx: BehavioralContext = {
      windowDays: 28,
      bys: { total: 1, safe: 1, risky: 0, do_not_send: 0 },
      review: { total: 0, repair_branch_active: 0, no_repair_branch: 0, needs_next: {} },
    };
    const out = buildReflectionPrompt({ ...baseParams, behavioralContext: ctx });
    expect(out.user).toMatch(/framing only.*do NOT quote/);
  });

  it("uses prompt_version 3.1.0", () => {
    const out = buildReflectionPrompt(baseParams);
    expect(out.prompt_version).toBe("3.1.0");
  });
});

describe("isBehavioralContextEmpty", () => {
  it("returns true for null / undefined", () => {
    expect(isBehavioralContextEmpty(null)).toBe(true);
    expect(isBehavioralContextEmpty(undefined)).toBe(true);
  });

  it("returns true when both bys and review totals are zero", () => {
    expect(
      isBehavioralContextEmpty({
        windowDays: 28,
        bys: { total: 0, safe: 0, risky: 0, do_not_send: 0 },
        review: { total: 0, repair_branch_active: 0, no_repair_branch: 0, needs_next: {} },
      }),
    ).toBe(true);
  });

  it("returns false when bys total > 0", () => {
    expect(
      isBehavioralContextEmpty({
        windowDays: 28,
        bys: { total: 1, safe: 1, risky: 0, do_not_send: 0 },
        review: { total: 0, repair_branch_active: 0, no_repair_branch: 0, needs_next: {} },
      }),
    ).toBe(false);
  });

  it("returns false when review total > 0", () => {
    expect(
      isBehavioralContextEmpty({
        windowDays: 28,
        bys: { total: 0, safe: 0, risky: 0, do_not_send: 0 },
        review: { total: 1, repair_branch_active: 0, no_repair_branch: 1, needs_next: {} },
      }),
    ).toBe(false);
  });
});
