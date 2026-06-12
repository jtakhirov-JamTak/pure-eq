// ============================================================
// Activity stats — usage-over-time aggregation (raw_records)
// ============================================================
// Originally the "Your activity" heatmap dashboard on the Conversations tab;
// that slot now shows conversation stats (conversation-stats.ts) and the
// heatmap UI lives inside the Monthly Report (a 4-week snapshot built by
// monthly-report.ts on the shared primitives in activity-types.ts).
// getActivityStats currently has no renderer — kept because the 10-week
// dashboard is a likely re-add and the math is tested/correct. If it's still
// unconsumed after the Monthly Report ships and settles, delete it in a
// techdebt pass.
//
// Source is raw_records (one row per completed module run). We fetch a single
// bounded window (since the start of last month OR 8 weeks ago, whichever is
// earlier) and aggregate in JS. v0 .limit(1000) cap — comment the RPC-upgrade
// path (date_trunc GROUP BY) for when a user exceeds it.
import { createClient } from "@/lib/supabase/server";
import { captureServerRead } from "@/lib/read-capture";
import {
  bucketFor,
  BUCKET_PRIORITY,
  type ActivityBucket,
  type DayCell,
} from "./activity-types";

// Re-export the shared primitives so existing imports keep working.
export { bucketFor, type ActivityBucket, type DayCell };

export const ACTIVITY_WEEKS = 8;

// Heatmap grid: trailing N weeks, columns = weeks (oldest → newest), rows =
// weekdays Mon..Sun. Each day cell is colored by its dominant activity type.
export const ACTIVITY_GRID_WEEKS = 10;

export type ActivityStats = {
  // Oldest → newest. Length === ACTIVITY_WEEKS. count = completed runs that week.
  weeklyBars: { count: number }[];
  // Columns oldest → newest (length ACTIVITY_GRID_WEEKS); each column is 7 days
  // Mon..Sun. Always full-arity so the renderer can assume the shape.
  gridWeeks: DayCell[][];
  thisMonthTotal: number;
  lastMonthTotal: number;
  byType: Record<ActivityBucket, number>;
  activeDaysLast7: number;
  hasAny: boolean;
};

// Build the Mon..Sun × weeks grid from a day-key → per-bucket-count map.
// gridStart must be the Monday of the oldest week. An empty map yields an
// all-empty grid (used by the no-activity state so the shape is always valid).
function buildGrid(
  gridStart: Date,
  byDay: Map<number, Record<ActivityBucket, number>>,
): DayCell[][] {
  const weeks: DayCell[][] = [];
  for (let w = 0; w < ACTIVITY_GRID_WEEKS; w++) {
    const col: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + w * 7 + d,
      );
      const counts = byDay.get(day.getTime());
      let dominant: ActivityBucket | null = null;
      let total = 0;
      if (counts) {
        for (const b of BUCKET_PRIORITY) {
          total += counts[b];
          if (counts[b] > (dominant ? counts[dominant] : 0)) dominant = b;
        }
      }
      col.push({ date: day.toISOString(), dominant, total });
    }
    weeks.push(col);
  }
  return weeks;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export async function getActivityStats(userId: string): Promise<ActivityStats> {
  const supabase = await createClient();

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const eightWeeksAgo = startOfDay(
    new Date(now.getTime() - ACTIVITY_WEEKS * 7 * 24 * 60 * 60 * 1000),
  );
  // Heatmap grid starts on the Monday of the oldest visible week.
  const dayOfWeek = now.getDay(); // 0 = Sun .. 6 = Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const thisMonday = startOfDay(now);
  thisMonday.setDate(thisMonday.getDate() - daysSinceMonday);
  const gridStart = new Date(thisMonday);
  gridStart.setDate(thisMonday.getDate() - (ACTIVITY_GRID_WEEKS - 1) * 7);
  // Fetch far enough back to cover the trend window, the month math, AND the grid.
  const windowStart = [startOfLastMonth, eightWeeksAgo, gridStart].reduce(
    (a, b) => (a < b ? a : b),
  );

  const res = await supabase
    .from("raw_records")
    .select("record_type, created_at")
    .eq("user_id", userId)
    .eq("is_complete", true)
    .is("deleted_at", null)
    .gte("created_at", windowStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(1000);

  const empty: ActivityStats = {
    weeklyBars: Array.from({ length: ACTIVITY_WEEKS }, () => ({ count: 0 })),
    gridWeeks: buildGrid(gridStart, new Map()),
    thisMonthTotal: 0,
    lastMonthTotal: 0,
    byType: { conversations: 0, pulse: 0, regulation: 0, beforeSend: 0 },
    activeDaysLast7: 0,
    hasAny: false,
  };

  if (res.error) {
    captureServerRead(
      "conversations",
      "activity_raw_records",
      new Error("activity_raw_records_read_failed"),
    );
    return empty;
  }

  const rows = (res.data ?? []).filter((r) => bucketFor(r.record_type));
  if (rows.length === 0) return empty;

  const weeklyBars = Array.from({ length: ACTIVITY_WEEKS }, () => ({
    count: 0,
  }));
  const byType: Record<ActivityBucket, number> = {
    conversations: 0,
    pulse: 0,
    regulation: 0,
    beforeSend: 0,
  };
  let thisMonthTotal = 0;
  let lastMonthTotal = 0;
  // Per-day, per-bucket counts for the heatmap grid.
  const byDay = new Map<number, Record<ActivityBucket, number>>();
  const activeDays = new Set<string>();
  const sevenDaysAgo = startOfDay(
    new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
  );
  const todayStart = startOfDay(now).getTime();

  for (const r of rows) {
    const created = new Date(r.created_at);
    const bucket = bucketFor(r.record_type)!;

    // 8-week trend: bar index by whole weeks since today (0 = this week).
    const daysAgo = Math.floor(
      (todayStart - startOfDay(created).getTime()) / (24 * 60 * 60 * 1000),
    );
    const weeksAgo = Math.floor(daysAgo / 7);
    if (weeksAgo >= 0 && weeksAgo < ACTIVITY_WEEKS) {
      // Oldest week first → reverse the index.
      weeklyBars[ACTIVITY_WEEKS - 1 - weeksAgo].count += 1;
    }

    // Month totals + this-month by-type breakdown.
    if (created >= startOfThisMonth) {
      thisMonthTotal += 1;
      byType[bucket] += 1;
    } else if (created >= startOfLastMonth) {
      lastMonthTotal += 1;
    }

    // Heatmap grid: bump this day's bucket count.
    const dayKey = startOfDay(created).getTime();
    const existing =
      byDay.get(dayKey) ??
      { conversations: 0, pulse: 0, regulation: 0, beforeSend: 0 };
    existing[bucket] += 1;
    byDay.set(dayKey, existing);

    // Active days in the last 7 (incl. today).
    if (created >= sevenDaysAgo) {
      activeDays.add(startOfDay(created).toISOString());
    }
  }

  return {
    weeklyBars,
    gridWeeks: buildGrid(gridStart, byDay),
    thisMonthTotal,
    lastMonthTotal,
    byType,
    activeDaysLast7: activeDays.size,
    hasAny: true,
  };
}
