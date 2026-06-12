// Pure activity-heatmap primitives — shared by the server-side stats
// builders (activity-stats.ts, monthly-report.ts) AND client components that
// render heatmap snapshots (MonthlyReportCard). Keep this module free of any
// server-only import (supabase/server, next/headers) so it stays safe in
// client bundles.

export type ActivityBucket =
  | "conversations"
  | "pulse"
  | "regulation"
  | "beforeSend";

// One day in a heatmap. dominant = the bucket with the most runs that day
// (null on an empty day); total = all completed runs that day (intensity).
export type DayCell = {
  date: string; // local start-of-day ISO
  dominant: ActivityBucket | null;
  total: number;
};

// Fixed tie-break order when a day has equal counts across types.
export const BUCKET_PRIORITY: ActivityBucket[] = [
  "conversations",
  "pulse",
  "regulation",
  "beforeSend",
];

// record_type → heatmap bucket. Single source so the Convos-era heatmap math
// and the Monthly Report snapshot can never disagree.
export function bucketFor(recordType: string): ActivityBucket | null {
  switch (recordType) {
    case "prepare":
    case "review":
      return "conversations";
    case "pulse_check":
      return "pulse";
    case "trigger_log":
    case "overwhelmed":
      return "regulation";
    case "before_you_send":
      return "beforeSend";
    default:
      return null; // onboarding_profile, outcome_tracking, etc.
  }
}
