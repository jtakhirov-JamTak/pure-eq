import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import type { ActivityStats } from "@/lib/coach/activity-stats";

// "Your activity" dashboard — presentational, server-safe (no client JS). Bars
// are plain divs, so no charting library hits the bundle. Degrades gracefully:
// a user with no completed runs sees an encouraging empty state, not a row of
// zero-height bars.

const TYPE_ROWS: { key: keyof ActivityStats["byType"]; label: string }[] = [
  { key: "conversations", label: "Conversations" },
  { key: "pulse", label: "Pulse checks" },
  { key: "regulation", label: "Regulation" },
  { key: "beforeSend", label: "Before-send" },
];

export function ActivityDashboard({ stats }: { stats: ActivityStats }) {
  if (!stats.hasAny) {
    return (
      <Card className="mt-4 p-5">
        <Kicker>Your activity</Kicker>
        <p className="mt-2 text-[13px] font-medium leading-[1.5] text-ink-soft">
          Once you start using Coach and the tools, your activity over time
          shows up here — how often you check in, and the mix of what you use.
        </p>
      </Card>
    );
  }

  const maxBar = Math.max(1, ...stats.weeklyBars.map((b) => b.count));
  const maxType = Math.max(1, ...TYPE_ROWS.map((r) => stats.byType[r.key]));
  const delta = stats.thisMonthTotal - stats.lastMonthTotal;

  return (
    <Card className="mt-4 p-5">
      <Kicker>Your activity</Kicker>

      {/* 8-week trend */}
      <div className="mt-4 flex h-20 items-end gap-1.5" aria-hidden>
        {stats.weeklyBars.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[3px] bg-accent/70"
            style={{
              height: `${Math.max(6, Math.round((b.count / maxBar) * 100))}%`,
            }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] font-medium text-ink-muted">
        Last {stats.weeklyBars.length} weeks
      </p>

      {/* This month total + month-over-month delta */}
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-display text-[28px] font-medium leading-none text-ink">
          {stats.thisMonthTotal}
        </span>
        <span className="text-[13px] font-medium text-ink-soft">
          this month
        </span>
        {stats.lastMonthTotal > 0 && (
          <span
            className={`text-[12px] font-semibold ${
              delta >= 0 ? "text-positive" : "text-ink-soft"
            }`}
          >
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)} vs last month
          </span>
        )}
      </div>

      {/* By-type breakdown (this month) */}
      <div className="mt-4 space-y-2">
        {TYPE_ROWS.map((row) => {
          const count = stats.byType[row.key];
          return (
            <div key={row.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-[12px] font-medium text-ink-soft">
                {row.label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-tint">
                <div
                  className="h-full rounded-full bg-accent/70"
                  style={{ width: `${Math.round((count / maxType) * 100)}%` }}
                />
              </div>
              <span className="w-5 shrink-0 text-right text-[12px] font-bold text-ink">
                {count}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[12px] font-medium text-ink-soft">
        Active {stats.activeDaysLast7} of the last 7 days
      </p>
    </Card>
  );
}
