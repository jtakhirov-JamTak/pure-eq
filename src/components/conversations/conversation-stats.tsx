import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import {
  GROUP_LABELS,
  type ConversationStats,
} from "@/lib/coach/conversation-stats";

// "Your conversations" dashboard — replaces the activity heatmap at the top of
// the Convos tab (the heatmap lives on in the Monthly Report). Presentational,
// server-safe (no client JS). Degrades gracefully: a user with no completed
// conversations sees an encouraging empty state, not a wall of zeros.

export function ConversationStatsCard({ stats }: { stats: ConversationStats }) {
  if (!stats.hasAny) {
    return (
      <Card className="p-5">
        <Kicker as="h2">Your conversations</Kicker>
        <p className="mt-2 text-[13px] font-medium leading-[1.5] text-ink-soft">
          Once you work through a conversation with Coach, the numbers show up
          here — who they&rsquo;re with, and how many are still open.
        </p>
      </Card>
    );
  }

  const maxGroup = Math.max(...stats.byGroup.map((g) => g.count), 1);

  return (
    <Card className="p-5">
      <Kicker as="h2">Your conversations</Kicker>

      {/* Totals + status: total / open / resolved. */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-[28px] font-medium leading-none text-ink">
          {stats.total}
        </span>
        <span className="text-[13px] font-medium text-ink-soft">
          conversation{stats.total === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-soft">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-accent"
          />
          <span className="font-bold text-ink">{stats.open}</span> open
        </span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-soft">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-positive"
          />
          <span className="font-bold text-ink">{stats.resolved}</span> resolved
        </span>
      </div>

      {/* By relationship group — only groups with at least one conversation. */}
      {stats.byGroup.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-soft">
            By relationship
          </p>
          <ul className="mt-2.5 space-y-2">
            {stats.byGroup.map(({ group, count }) => (
              <li key={group} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-[12px] font-semibold text-ink-soft">
                  {GROUP_LABELS[group]}
                </span>
                {/* Largest group = 60% of the row; everything else scales
                    proportionally (a flat maxWidth clamp made 0.6x–1x of the
                    max render as identical bars). 8% floor keeps tiny counts
                    visible. */}
                <span
                  className="h-2 rounded-full bg-accent/70"
                  style={{
                    width: `${Math.max((count / maxGroup) * 60, 8)}%`,
                  }}
                  aria-hidden="true"
                />
                <span className="text-[12px] font-bold text-ink">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top people by conversation count. */}
      {stats.topPeople.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-soft">
            Most conversations with
          </p>
          <ul className="mt-2 space-y-1.5">
            {stats.topPeople.map(({ personId, name, count }) => (
              <li
                key={personId}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
                  {name}
                </span>
                <span className="shrink-0 text-[12px] font-medium text-ink-soft">
                  {count} conversation{count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
