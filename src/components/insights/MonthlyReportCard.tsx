import type { MonthlyReportOutput } from "@/lib/ai/schemas";
import type { ReportSnapshot } from "@/lib/insights/report-snapshot";
import type { ActivityBucket } from "@/lib/coach/activity-types";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
// Shared timezone-safe formatter (handles bare YYYY-MM-DD and ISO timestamps).
import { formatLocalDate as formatDate } from "@/lib/utils";

// Presentational, server-safe (no client JS) — same conventions as
// ReflectionCard. Every section renders only when its data survived the
// server's verification pass (silence over garbage): an empty tendencies
// array, a null key_person, etc. simply don't appear.

// Same tile-palette hues as the old activity dashboard.
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

// Same three-tier chip styling as ReflectionCard (confidence was derived
// server-side when each weekly reflection generated).
const CONFIDENCE_CHIP: Record<string, string> = {
  clear: "bg-accent text-accent-text",
  emerging: "bg-accent/20 text-accent-ink",
  early: "bg-surface-tint text-ink-soft",
};

const EQ_ROWS: { key: keyof EqShape; label: string; sub: string }[] = [
  {
    key: "self_awareness",
    label: "Self-awareness",
    sub: "knowing what you feel and why",
  },
  {
    key: "self_management",
    label: "Self-management",
    sub: "regulating your reaction",
  },
  {
    key: "social_awareness",
    label: "Social awareness",
    sub: "reading people and the room",
  },
  {
    key: "relationship_management",
    label: "Relationship management",
    sub: "communicating, repairing, handling conflict",
  },
];

type EqShape = Extract<MonthlyReportOutput, { mode: "report" }>["eq_ratings"];

// Real <h3> headings (not styled <p>s): this is the longest card in the app,
// and a screen reader needs to jump between its sections. ink-soft, not
// ink-muted — these are must-read labels and ink-muted fails AA at 11px.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-soft">
      {children}
    </h3>
  );
}

function EvidenceQuote({
  quote,
  sourceDate,
}: {
  quote: string;
  sourceDate: string;
}) {
  return (
    <blockquote className="border-l-2 border-accent pl-3 text-[12px] italic leading-[1.5] text-ink-soft">
      &ldquo;{quote}&rdquo;
      <span className="ml-2 not-italic text-[11px] font-medium text-ink-soft">
        — {formatDate(sourceDate)}
      </span>
    </blockquote>
  );
}

interface Props {
  report: MonthlyReportOutput;
  snapshot: ReportSnapshot;
  generatedAt: string; // ISO
  // See ReflectionCard: suppress the title/byline when rendered inside a
  // collapsible InsightsSection (the section header carries them + the canary).
  hideHeader?: boolean;
}

export function MonthlyReportCard({
  report,
  snapshot,
  generatedAt,
  hideHeader,
}: Props) {
  // Refusal shape — low-key card, mirrors ReflectionCard.
  if (report.mode === "refusal") {
    return (
      <Card className="mt-4 p-5">
        {!hideHeader && <Kicker as="h2">Your monthly report</Kicker>}
        <p
          className={`${hideHeader ? "" : "mt-2 "}text-[13px] font-medium leading-[1.55] text-ink-soft`}
        >
          {report.message_to_user}
        </p>
        {!hideHeader && (
          <p className="mt-3 text-[11px] font-medium text-ink-soft">
            Checked on {formatDate(generatedAt)}
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="mt-4 p-5">
      {!hideHeader && (
        <div className="flex items-baseline justify-between gap-3">
          <Kicker as="h2">Your monthly report</Kicker>
          {/* Byline canary — same migration-0018 defense as the weekly.
              ink-soft: a canary the user can't read is a weak canary. */}
          <p className="text-[11px] font-medium text-ink-soft">
            Generated {formatDate(generatedAt)}
          </p>
        </div>
      )}

      <p
        className={`${hideHeader ? "" : "mt-2 "}text-[13px] font-medium leading-[1.55] text-ink`}
      >
        {report.summary}
      </p>

      {/* 4-week usage heatmap — server snapshot, frozen to the report period.
          Fixed 24px cells, NOT flex-1/aspect-square: that markup came from
          the 10-column dashboard, and at 4 columns width-derived cells
          balloon to ~66px (a half-screen wall of squares at 375px). The grid
          is aria-hidden — the legend + total carry the same data as text. */}
      <div className="mt-5">
        <SectionLabel>Your last 4 weeks</SectionLabel>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          <div className="flex w-3.5 shrink-0 flex-col gap-[3px]">
            {WEEKDAY_LABELS.map((l, i) => (
              <span
                key={i}
                className="flex h-6 items-center text-[8px] leading-none text-ink-muted"
              >
                {l}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {snapshot.grid.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
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
                      className="h-6 w-6 rounded-[2px]"
                      style={style}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {LEGEND.map(({ key, label }) => (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-soft"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: BUCKET_COLORS[key] }}
              />
              {label}
              <span className="font-bold text-ink">
                {snapshot.byType[key] ?? 0}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-2 text-[12px] font-medium text-ink-soft">
          {snapshot.total} {snapshot.total === 1 ? "entry" : "entries"} in the
          last 4 weeks
        </p>
      </div>

      {/* Tendencies per relationship context + regulation patterns. */}
      {(report.tendencies.length > 0 ||
        report.trigger_pattern ||
        report.overwhelm_pattern) && (
        <div className="mt-6">
          <SectionLabel>How you tend to show up</SectionLabel>
          <div className="mt-3 space-y-5">
            {report.tendencies.map((t, i) => (
              <div
                key={`${t.context}-${i}`}
                className="border-t border-hairline pt-4 first:border-0 first:pt-0"
              >
                <p className="text-[14px] font-semibold leading-[1.3] text-ink">
                  In {t.context} interactions
                </p>
                <p className="mt-1.5 text-[13px] font-medium leading-[1.55] text-ink-soft">
                  {t.tendency}
                </p>
                <div className="mt-2.5 space-y-2">
                  {t.evidence.map((ev, j) => (
                    <EvidenceQuote
                      key={j}
                      quote={ev.quote}
                      sourceDate={ev.source_date}
                    />
                  ))}
                </div>
              </div>
            ))}
            {report.trigger_pattern && (
              <div className="border-t border-hairline pt-4">
                <p className="text-[14px] font-semibold leading-[1.3] text-ink">
                  You&rsquo;re most likely triggered by
                </p>
                <p className="mt-1.5 text-[13px] font-medium leading-[1.55] text-ink-soft">
                  {report.trigger_pattern.statement}
                </p>
                <div className="mt-2.5 space-y-2">
                  {report.trigger_pattern.evidence.map((ev, j) => (
                    <EvidenceQuote
                      key={j}
                      quote={ev.quote}
                      sourceDate={ev.source_date}
                    />
                  ))}
                </div>
              </div>
            )}
            {report.overwhelm_pattern && (
              <div className="border-t border-hairline pt-4">
                <p className="text-[14px] font-semibold leading-[1.3] text-ink">
                  You&rsquo;re most likely overwhelmed by
                </p>
                <p className="mt-1.5 text-[13px] font-medium leading-[1.55] text-ink-soft">
                  {report.overwhelm_pattern.statement}
                </p>
                <div className="mt-2.5 space-y-2">
                  {report.overwhelm_pattern.evidence.map((ev, j) => (
                    <EvidenceQuote
                      key={j}
                      quote={ev.quote}
                      sourceDate={ev.source_date}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Weekly-focus follow-through. ✓/○ comes from server counts; "–" =
          set too recently to grade. */}
      {snapshot.focusHistory.length > 0 && (
        <div className="mt-6 rounded-card bg-surface-tint p-4">
          <SectionLabel>Your weekly focuses</SectionLabel>
          <ul className="mt-2 space-y-2">
            {snapshot.focusHistory.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 text-[13px] font-bold ${
                    f.tookAction === true
                      ? "text-accent-ink"
                      : "text-ink-muted"
                  }`}
                >
                  {f.tookAction === true ? "✓" : f.tookAction === false ? "○" : "–"}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold leading-[1.3] text-ink">
                    {f.theme}
                  </p>
                  {/* ink-soft: this line is the ONLY textual conveyance of
                      the aria-hidden ✓/○/– glyph state — it must be legible. */}
                  <p className="mt-0.5 text-[11px] font-medium text-ink-soft">
                    set {formatDate(f.setOn)} ·{" "}
                    {f.tookAction === true
                      ? "acted on"
                      : f.tookAction === false
                        ? "not acted on"
                        : "too recent to grade"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {report.focus_trend && (
            <p className="mt-3 text-[13px] font-medium leading-[1.55] text-ink-soft">
              {report.focus_trend}
            </p>
          )}
        </div>
      )}

      {/* Top patterns — themes + confidence are server-ranked from the
          month's weekly reflections; the model only adds the month-level note. */}
      {report.top_patterns.length > 0 && (
        <div className="mt-6">
          <SectionLabel>Your top patterns this month</SectionLabel>
          <div className="mt-3 space-y-4">
            {report.top_patterns.map((p, i) => {
              const confidence = snapshot.topPatterns.find(
                (c) => c.theme.trim() === p.theme.trim(),
              )?.confidence;
              return (
                <div
                  key={i}
                  className="border-t border-hairline pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-[14px] font-semibold leading-[1.3] text-ink">
                      {p.theme}
                    </p>
                    {confidence && (
                      <span
                        className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] ${
                          CONFIDENCE_CHIP[confidence] ?? CONFIDENCE_CHIP.early
                        }`}
                      >
                        {confidence}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[13px] font-medium leading-[1.55] text-ink-soft">
                    {p.note}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Key person — accent block, closes with one doable tip. */}
      {report.key_person && (
        <div className="mt-6 rounded-card border border-accent/40 bg-accent/10 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-accent-ink">
            The relationship to focus on
          </p>
          <p className="mt-1.5 text-[14px] font-semibold leading-[1.3] text-ink">
            {report.key_person.name}
          </p>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.55] text-ink-soft">
            {report.key_person.why}
          </p>
          <p className="mt-2.5 text-[13px] font-medium leading-[1.55] text-ink">
            <span className="font-semibold">One tip:</span>{" "}
            {report.key_person.tip}
          </p>
        </div>
      )}

      {/* EQ ratings — scores are 1–10, baseline 5; 9–10 near-unreachable. */}
      <div className="mt-6">
        <SectionLabel>Your EQ this month</SectionLabel>
        <div className="mt-3 space-y-4">
          {EQ_ROWS.map(({ key, label, sub }) => {
            const r = report.eq_ratings[key];
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-semibold text-ink">{label}</p>
                  <p className="shrink-0 text-[13px] font-bold text-ink">
                    {r.score}
                    <span className="font-medium text-ink-soft">/10</span>
                  </p>
                </div>
                <p className="text-[11px] font-medium text-ink-soft">{sub}</p>
                <div
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-tint"
                  role="img"
                  aria-label={`${label}: ${r.score} out of 10`}
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${r.score * 10}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[12px] font-medium leading-[1.5] text-ink-soft">
                  {r.why}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] font-medium leading-[1.5] text-ink-soft">
          5 is the everyday baseline. 9–10 is near-unreachable on purpose —
          movement matters more than the number.
        </p>
      </div>
    </Card>
  );
}
