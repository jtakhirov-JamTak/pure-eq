import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import type { ActivityBucket, ActivityStats } from "@/lib/coach/activity-stats";

// "Your activity" dashboard — a contributions-style heatmap colored by activity
// type. Presentational, server-safe (no client JS): cells are plain divs, so no
// charting library hits the bundle. Degrades gracefully: a user with no
// completed runs sees an encouraging empty state, not a grid of blank cells.

// Type colors, drawn from the app's tile palette (blue / teal / gold / violet)
// so each activity reads as a distinct hue on the dark grid.
const BUCKET_COLORS: Record<ActivityBucket, string> = {
  conversations: "#2E7DD1",
  pulse: "#0E9488",
  regulation: "#D9A05A",
  beforeSend: "#8B7FD4",
};

const LEGEND: { key: ActivityBucket; label: string }[] = [
  { key: "conversations", label: "Conversations" },
  { key: "pulse", label: "Pulse checks" },
  { key: "regulation", label: "Regulation" },
  { key: "beforeSend", label: "Before-send" },
];

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export function ActivityDashboard({ stats }: { stats: ActivityStats }) {
  if (!stats.hasAny) {
    return (
      <Card className="p-5">
        <Kicker>Your activity</Kicker>
        <p className="mt-2 text-[13px] font-medium leading-[1.5] text-ink-soft">
          Once you start using Coach and the tools, your activity over time
          shows up here — how often you check in, and the mix of what you use.
        </p>
      </Card>
    );
  }

  const delta = stats.thisMonthTotal - stats.lastMonthTotal;

  return (
    <Card className="p-5">
      <Kicker>Your activity</Kicker>
      <p className="mt-1 text-[11px] font-medium text-ink-muted">
        Last {stats.gridWeeks.length} weeks →
      </p>

      {/* Heatmap: weekday rows (Mon..Sun) × week columns (oldest → newest). */}
      <div className="mt-3 flex gap-1.5">
        <div className="flex w-3.5 shrink-0 flex-col gap-[3px]">
          {WEEKDAY_LABELS.map((l, i) => (
            <span
              key={i}
              className="flex flex-1 items-center text-[8px] leading-none text-ink-muted"
              aria-hidden
            >
              {l}
            </span>
          ))}
        </div>
        <div className="flex flex-1 gap-[3px]">
          {stats.gridWeeks.map((week, wi) => (
            <div key={wi} className="flex flex-1 flex-col gap-[3px]">
              {week.map((cell) => {
                const style = cell.dominant
                  ? {
                      backgroundColor: BUCKET_COLORS[cell.dominant],
                      opacity: cell.total >= 2 ? 1 : 0.62,
                    }
                  : { backgroundColor: "rgba(255,255,255,0.05)" };
                return (
                  <div
                    key={cell.date}
                    className="aspect-square rounded-[2px]"
                    style={style}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend with this-month counts per type. */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {LEGEND.map(({ key, label }) => (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-soft"
          >
            <span
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ backgroundColor: BUCKET_COLORS[key] }}
            />
            {label}
            <span className="font-bold text-ink">{stats.byType[key]}</span>
          </span>
        ))}
      </div>

      {/* This month total + month-over-month delta. */}
      <div className="mt-5 flex items-baseline gap-2">
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

      <p className="mt-3 text-[12px] font-medium text-ink-soft">
        Active {stats.activeDaysLast7} of the last 7 days
      </p>
    </Card>
  );
}
