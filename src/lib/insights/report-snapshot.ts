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
// Narrow checks on the load-bearing structure; renderers handle the rest.
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
    Array.isArray(s.topPatterns)
  );
}
