// ============================================================
// Activity stats — the "Your activity" dashboard on the Conversations tab
// ============================================================
// Replaces the flat per-module count boxes that used to live on /history with
// a usage-over-time read: an 8-week bar trend, this-month total vs. last month,
// a by-type breakdown, and a recent-consistency stat.
//
// Source is raw_records (one row per completed module run). We fetch a single
// bounded window (since the start of last month OR 8 weeks ago, whichever is
// earlier) and aggregate in JS. v0 .limit(1000) cap — comment the RPC-upgrade
// path (date_trunc GROUP BY) for when a user exceeds it.
import { createClient } from "@/lib/supabase/server";
import { captureServerRead } from "@/lib/read-capture";

export const ACTIVITY_WEEKS = 8;

export type ActivityBucket = "conversations" | "pulse" | "regulation" | "beforeSend";

export type ActivityStats = {
  // Oldest → newest. Length === ACTIVITY_WEEKS. count = completed runs that week.
  weeklyBars: { count: number }[];
  thisMonthTotal: number;
  lastMonthTotal: number;
  byType: Record<ActivityBucket, number>;
  activeDaysLast7: number;
  hasAny: boolean;
};

function bucketFor(recordType: string): ActivityBucket | null {
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
  const windowStart =
    startOfLastMonth < eightWeeksAgo ? startOfLastMonth : eightWeeksAgo;

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

    // Active days in the last 7 (incl. today).
    if (created >= sevenDaysAgo) {
      activeDays.add(startOfDay(created).toISOString());
    }
  }

  return {
    weeklyBars,
    thisMonthTotal,
    lastMonthTotal,
    byType,
    activeDaysLast7: activeDays.size,
    hasAny: true,
  };
}
