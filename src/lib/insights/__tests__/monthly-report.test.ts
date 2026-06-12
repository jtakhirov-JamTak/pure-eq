import { describe, expect, it } from "vitest";
import {
  buildReportGrid,
  rankTopPatterns,
  toneForReportIndex,
  verifyReport,
  reportIsViable,
  REPORT_GRID_WEEKS,
} from "../monthly-report";
import { isReportSnapshot } from "../report-snapshot";
import type { MonthlyReportNormal } from "@/lib/ai/schemas";

// ---------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------

const ev = (id: string, quote: string) => ({
  quote,
  source_record_id: id,
  source_date: "2026-06-01",
});

// Lookup text contains each quote so substring verification passes.
const lookup = new Map<string, string>([
  ["work-1", "I keep my head down and avoid the conflict at standup"],
  ["work-2", "I said nothing in the meeting again even though it stung"],
  ["fam-1", "I snapped at my brother before he finished talking"],
  ["trig-1", "being interrupted mid-sentence makes my chest tight"],
  ["ovw-1", "too many pings at once and I just shut the laptop"],
]);

const meta = new Map<
  string,
  { recordType: string; context: "work" | "family" | "friend" | "partner" | "other" | null }
>([
  ["work-1", { recordType: "prepare", context: "work" }],
  ["work-2", { recordType: "review", context: "work" }],
  ["fam-1", { recordType: "review", context: "family" }],
  ["trig-1", { recordType: "trigger_log", context: null }],
  ["ovw-1", { recordType: "overwhelmed", context: null }],
]);

const eq = {
  self_awareness: { score: 5, why: "Names feelings in most entries." },
  self_management: { score: 4, why: "Often reacts before regulating." },
  social_awareness: { score: 5, why: "Reads the room in reviews." },
  relationship_management: { score: 5, why: "Repairs after conflicts." },
};

function baseReport(
  overrides: Partial<MonthlyReportNormal> = {},
): MonthlyReportNormal {
  return {
    mode: "report",
    summary: "A month of avoiding conflict at work and snapping at home.",
    tendencies: [
      {
        context: "work",
        tendency: "In work interactions, you tend to go quiet under pressure.",
        evidence: [ev("work-1", "avoid the conflict at standup")],
      },
    ],
    trigger_pattern: {
      statement: "You're most likely triggered by being interrupted.",
      evidence: [ev("trig-1", "being interrupted mid-sentence")],
    },
    overwhelm_pattern: null,
    focus_trend: "You acted on one of two focuses.",
    top_patterns: [
      { theme: "You pull back when contradicted", note: "Held all month." },
    ],
    key_person: { name: "Matt", why: "Most entries and an open thread.", tip: "Schedule one low-stakes check-in." },
    eq_ratings: eq,
    ...overrides,
  };
}

const allowedAll = {
  contexts: ["work", "family"] as ("work" | "family")[],
  triggerOk: true,
  overwhelmOk: true,
  candidateThemes: ["You pull back when contradicted"],
  personNames: ["Matt"],
  hasFocusHistory: true,
};

// ---------------------------------------------------------------
// verifyReport
// ---------------------------------------------------------------

describe("verifyReport", () => {
  it("keeps fully verified sections unchanged", () => {
    const out = verifyReport(baseReport(), lookup, meta, allowedAll);
    expect(out.tendencies).toHaveLength(1);
    expect(out.trigger_pattern).not.toBeNull();
    expect(out.top_patterns).toHaveLength(1);
    expect(out.key_person?.name).toBe("Matt");
    expect(out.focus_trend).not.toBeNull();
  });

  it("drops a tendency whose context is not allowed", () => {
    const report = baseReport({
      tendencies: [
        {
          context: "friend",
          tendency: "In friend interactions, you tend to overshare.",
          evidence: [ev("work-1", "avoid the conflict at standup")],
        },
      ],
    });
    const out = verifyReport(report, lookup, meta, allowedAll);
    expect(out.tendencies).toHaveLength(0);
  });

  it("drops a tendency whose quote does not substring-verify", () => {
    const report = baseReport({
      tendencies: [
        {
          context: "work",
          tendency: "You tend to go quiet.",
          evidence: [ev("work-1", "a fabricated quote that is not there")],
        },
      ],
    });
    const out = verifyReport(report, lookup, meta, allowedAll);
    expect(out.tendencies).toHaveLength(0);
  });

  it("drops a tendency whose evidence cites an entry from a DIFFERENT context", () => {
    const report = baseReport({
      tendencies: [
        {
          context: "work",
          tendency: "You tend to go quiet.",
          // Quote verifies, but fam-1 is a family-context entry.
          evidence: [ev("fam-1", "snapped at my brother")],
        },
      ],
    });
    const out = verifyReport(report, lookup, meta, allowedAll);
    expect(out.tendencies).toHaveLength(0);
  });

  it("nulls trigger_pattern when the type minimum was not met", () => {
    const out = verifyReport(baseReport(), lookup, meta, {
      ...allowedAll,
      triggerOk: false,
    });
    expect(out.trigger_pattern).toBeNull();
  });

  it("nulls trigger_pattern when evidence cites a non-trigger entry", () => {
    const report = baseReport({
      trigger_pattern: {
        statement: "Triggered by interruptions.",
        // Verifies as a substring of work-1, but work-1 is a prepare entry.
        evidence: [ev("work-1", "avoid the conflict")],
      },
    });
    const out = verifyReport(report, lookup, meta, allowedAll);
    expect(out.trigger_pattern).toBeNull();
  });

  it("drops top_patterns whose theme is not a server candidate", () => {
    const report = baseReport({
      top_patterns: [
        { theme: "An invented theme", note: "Should be dropped." },
        { theme: "You pull back when contradicted", note: "Kept." },
      ],
    });
    const out = verifyReport(report, lookup, meta, allowedAll);
    expect(out.top_patterns).toHaveLength(1);
    expect(out.top_patterns[0].theme).toBe("You pull back when contradicted");
  });

  it("nulls key_person when the name is not in the signal table", () => {
    const report = baseReport({
      key_person: { name: "Nobody", why: "…", tip: "…" },
    });
    const out = verifyReport(report, lookup, meta, allowedAll);
    expect(out.key_person).toBeNull();
  });

  it("forces focus_trend null when the month had no focus history", () => {
    const out = verifyReport(baseReport(), lookup, meta, {
      ...allowedAll,
      hasFocusHistory: false,
    });
    expect(out.focus_trend).toBeNull();
  });
});

// ---------------------------------------------------------------
// reportIsViable
// ---------------------------------------------------------------

describe("reportIsViable", () => {
  it("is false when every grounded section dropped (EQ alone is not sellable)", () => {
    const empty = baseReport({
      tendencies: [],
      trigger_pattern: null,
      overwhelm_pattern: null,
      top_patterns: [],
    });
    expect(reportIsViable(empty)).toBe(false);
  });

  it("is true with a single surviving tendency", () => {
    const report = baseReport({
      trigger_pattern: null,
      top_patterns: [],
    });
    expect(reportIsViable(report)).toBe(true);
  });

  it("is true with only a regulation pattern", () => {
    const report = baseReport({ tendencies: [], top_patterns: [] });
    expect(reportIsViable(report)).toBe(true);
  });
});

// ---------------------------------------------------------------
// rankTopPatterns
// ---------------------------------------------------------------

describe("rankTopPatterns", () => {
  it("ranks by confidence weight and caps at 3", () => {
    const out = rankTopPatterns([
      { theme: "a", confidence: "early" },
      { theme: "b", confidence: "clear" },
      { theme: "c", confidence: "emerging" },
      { theme: "d", confidence: "early" },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].theme).toBe("b");
    expect(out[1].theme).toBe("c");
  });

  it("dedupes by theme keeping the strongest confidence", () => {
    const out = rankTopPatterns([
      { theme: "same", confidence: "clear" },
      { theme: "same", confidence: "early" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe("clear");
  });

  it("prefers the more recent observation on equal confidence", () => {
    const out = rankTopPatterns([
      { theme: "older", confidence: "emerging" },
      { theme: "newer", confidence: "emerging" },
    ]);
    expect(out[0].theme).toBe("newer");
  });
});

// ---------------------------------------------------------------
// toneForReportIndex
// ---------------------------------------------------------------

describe("toneForReportIndex", () => {
  it("follows the founder schedule: first, gentle, then realistic forever", () => {
    expect(toneForReportIndex(0)).toBe("first");
    expect(toneForReportIndex(1)).toBe("gentle");
    expect(toneForReportIndex(2)).toBe("realistic");
    expect(toneForReportIndex(7)).toBe("realistic");
  });
});

// ---------------------------------------------------------------
// buildReportGrid + isReportSnapshot
// ---------------------------------------------------------------

describe("buildReportGrid", () => {
  // Wed Jun 10 2026 local — Monday of that week is Jun 8.
  const now = new Date(2026, 5, 10, 12, 0, 0);

  it("emits a full-arity 4×7 grid", () => {
    const grid = buildReportGrid([], now);
    expect(grid).toHaveLength(REPORT_GRID_WEEKS);
    for (const col of grid) expect(col).toHaveLength(7);
    expect(grid.flat().every((c) => c.total === 0 && c.dominant === null)).toBe(
      true,
    );
  });

  it("buckets items onto the right day and picks the dominant type", () => {
    const day = new Date(2026, 5, 9, 9, 0, 0).toISOString(); // Tue this week
    const grid = buildReportGrid(
      [
        { createdAt: day, bucket: "regulation" },
        { createdAt: day, bucket: "regulation" },
        { createdAt: day, bucket: "conversations" },
      ],
      now,
    );
    const lastWeek = grid[REPORT_GRID_WEEKS - 1];
    const tue = lastWeek[1]; // Mon..Sun → index 1 = Tuesday
    expect(tue.total).toBe(3);
    expect(tue.dominant).toBe("regulation");
  });

  it("breaks dominant ties by the fixed priority order", () => {
    const day = new Date(2026, 5, 8, 9, 0, 0).toISOString(); // Mon this week
    const grid = buildReportGrid(
      [
        { createdAt: day, bucket: "pulse" },
        { createdAt: day, bucket: "conversations" },
      ],
      now,
    );
    const mon = grid[REPORT_GRID_WEEKS - 1][0];
    expect(mon.dominant).toBe("conversations");
  });

  it("produces a snapshot shape isReportSnapshot accepts", () => {
    const snapshot = {
      grid: buildReportGrid([], now),
      byType: { conversations: 0, pulse: 0, regulation: 0, beforeSend: 0 },
      total: 0,
      focusHistory: [],
      topPatterns: [],
    };
    expect(isReportSnapshot(snapshot)).toBe(true);
  });
});

describe("isReportSnapshot", () => {
  it("rejects a grid with the wrong number of weeks", () => {
    expect(
      isReportSnapshot({
        grid: [[], [], []],
        byType: {},
        total: 0,
        focusHistory: [],
        topPatterns: [],
      }),
    ).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isReportSnapshot(null)).toBe(false);
    expect(isReportSnapshot("snapshot")).toBe(false);
    expect(isReportSnapshot([])).toBe(false);
  });
});
