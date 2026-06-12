// Monthly Report server_json snapshot — type + runtime shape guard.
//
// Lives in its own module (not monthly-report.ts) because client components
// (MonthlyReportCard, MonthlyReportKickoff) need the type and the guard, and
// monthly-report.ts pulls server-only deps (Anthropic, Sentry, observability)
// that must not enter the client bundle. Keep this file pure.

import type { ActivityBucket, DayCell } from "@/lib/coach/activity-types";

// Heatmap snapshot width: 4 Monday-aligned week columns ending the week the
// report was generated.
export const REPORT_GRID_WEEKS = 4;

// Minimum completed entries INSIDE the 28-day window before a report can
// generate. A month-level report over a handful of entries is garbage —
// silence over garbage. Lives here (not monthly-report.ts) so the client
// kickoff can show the same number without pulling server deps into the
// bundle; the generator re-exports it and enforces it server-side.
export const MIN_ENTRIES_FOR_REPORT = 10;

export type ReportSnapshot = {
  // Columns oldest → newest (length REPORT_GRID_WEEKS); each column is 7 days
  // Mon..Sun (full arity — the renderer assumes the shape).
  grid: DayCell[][];
  byType: Record<ActivityBucket, number>;
  total: number;
  // Weekly focuses set this month. tookAction is server-counted; null = the
  // focus was too recent to grade.
  focusHistory: Array<{
    theme: string;
    setOn: string; // YYYY-MM-DD
    tookAction: boolean | null;
  }>;
  // Server-ranked candidates with the confidence each weekly derived.
  topPatterns: Array<{
    theme: string;
    confidence: "early" | "emerging" | "clear";
  }>;
};

// Runtime shape guard for the jsonb read-back (CLAUDE.md untyped-jsonb rule).
// Item-level checks on the strings the renderer prints directly — a
// hand-edited row with a non-string theme would otherwise throw "Objects are
// not valid as a React child" instead of falling through to regenerate.
export function isReportSnapshot(v: unknown): v is ReportSnapshot {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const s = v as Record<string, unknown>;
  return (
    Array.isArray(s.grid) &&
    s.grid.length === REPORT_GRID_WEEKS &&
    s.grid.every((col) => Array.isArray(col) && col.length === 7) &&
    typeof s.total === "number" &&
    !!s.byType &&
    typeof s.byType === "object" &&
    Array.isArray(s.focusHistory) &&
    s.focusHistory.every(
      (f) =>
        !!f &&
        typeof f === "object" &&
        typeof (f as Record<string, unknown>).theme === "string" &&
        typeof (f as Record<string, unknown>).setOn === "string",
    ) &&
    Array.isArray(s.topPatterns) &&
    s.topPatterns.every(
      (p) =>
        !!p &&
        typeof p === "object" &&
        typeof (p as Record<string, unknown>).theme === "string" &&
        typeof (p as Record<string, unknown>).confidence === "string",
    )
  );
}
