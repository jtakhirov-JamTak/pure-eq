import type { ReflectionOutput } from "@/lib/ai/schemas";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
// Shared timezone-safe formatter (handles bare YYYY-MM-DD and ISO timestamps).
import { formatLocalDate as formatDate } from "@/lib/utils";

// Confidence chip styling per net-evidence level (set server-side in
// generate.ts deriveConfidence): clear = strongest, emerging = mid, early =
// faintest. Three visual tiers so the strength of a pattern reads at a glance.
const CONFIDENCE_CHIP: Record<string, string> = {
  clear: "bg-accent text-accent-text",
  emerging: "bg-accent/20 text-accent-ink",
  early: "bg-surface-tint text-ink-soft",
};

// Wire-value → display name for the four practice tools a focus can point at.
const FOCUS_MODULE_LABEL: Record<string, string> = {
  prepare: "Prepare",
  before_you_send: "Before-You-Send",
  triggered: "Triggered",
  review: "Review",
};

interface Props {
  reflection: ReflectionOutput;
  generatedAt: string; // ISO
  // When the card is rendered inside a collapsible section (InsightsSection),
  // the section header already shows the title + generated date, so suppress
  // the card's own title/byline row to avoid duplication. The section header's
  // date IS the migration-0018 canary in that layout.
  hideHeader?: boolean;
}

export function ReflectionCard({ reflection, generatedAt, hideHeader }: Props) {
  // Refusal shape — surface the model's message as a low-key card.
  if (reflection.mode === "refusal") {
    return (
      <Card className="mt-4 p-5">
        {!hideHeader && <Kicker as="h2">Your weekly reflection</Kicker>}
        <p
          className={`${hideHeader ? "" : "mt-2 "}text-[13px] font-medium leading-[1.55] text-ink-soft`}
        >
          {reflection.message_to_user}
        </p>
        {!hideHeader && (
          <p className="mt-3 text-[11px] font-medium text-ink-muted">
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
          <Kicker as="h2">Your weekly reflection</Kicker>
          {/* Prominent byline — if the writer ever silently breaks, a stale
              date is the user-visible canary (migration-0018 defense). */}
          <p className="text-[11px] font-medium text-ink-muted">
            Generated {formatDate(generatedAt)}
          </p>
        </div>
      )}

      <p
        className={`${hideHeader ? "" : "mt-2 "}text-[13px] font-medium leading-[1.55] text-ink`}
      >
        {reflection.summary}
      </p>

      {/* Look-back: did they act on last week's focus? Present only from the
          second reflection on. took_action is server-derived from real entry
          counts, so the ✓ / ○ can't be hand-waved by the model. */}
      {reflection.focus_followup && (
        <div className="mt-4 rounded-card bg-surface-tint p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted">
            Last week&apos;s focus
          </p>
          <div className="mt-1.5 flex items-start gap-2">
            <span
              aria-hidden="true"
              className={`mt-0.5 text-[13px] font-bold ${
                reflection.focus_followup.took_action
                  ? "text-accent-ink"
                  : "text-ink-muted"
              }`}
            >
              {reflection.focus_followup.took_action ? "✓" : "○"}
            </span>
            <div>
              <p className="text-[13px] font-semibold leading-[1.3] text-ink">
                {reflection.focus_followup.prior_theme}
              </p>
              <p className="mt-1 text-[12px] font-medium leading-[1.5] text-ink-soft">
                {reflection.focus_followup.note}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-5">
        {reflection.observations.map((obs, i) => (
          <div key={i} className="border-t border-hairline pt-4 first:border-0 first:pt-0">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[14px] font-semibold leading-[1.3] text-ink">
                {obs.theme}
              </p>
              <span
                className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] ${
                  CONFIDENCE_CHIP[obs.confidence] ?? CONFIDENCE_CHIP.early
                }`}
              >
                {obs.confidence}
              </span>
            </div>

            <p className="mt-2 text-[13px] font-medium leading-[1.55] text-ink-soft">
              {obs.observation}
            </p>

            <div className="mt-3 space-y-2">
              {obs.evidence.map((ev, j) => (
                <blockquote
                  key={j}
                  className="border-l-2 border-accent pl-3 text-[12px] italic leading-[1.5] text-ink-soft"
                >
                  &ldquo;{ev.quote}&rdquo;
                  <span className="ml-2 not-italic text-[11px] font-medium text-ink-muted">
                    — {formatDate(ev.source_date)}
                  </span>
                </blockquote>
              ))}
            </div>

            {obs.counter_evidence.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted">
                  But also
                </p>
                {obs.counter_evidence.map((ev, j) => (
                  <blockquote
                    key={j}
                    className="border-l-2 border-ink-muted pl-3 text-[12px] italic leading-[1.5] text-ink-soft"
                  >
                    &ldquo;{ev.quote}&rdquo;
                    <span className="ml-2 not-italic text-[11px] font-medium text-ink-muted">
                      — {formatDate(ev.source_date)}
                    </span>
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Forward-looking: the one prescribed practice for next week, closing
          the card as a call to action. */}
      <div className="mt-5 rounded-card border border-accent/40 bg-accent/10 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-accent-ink">
          Your focus for next week
        </p>
        <p className="mt-1.5 text-[14px] font-semibold leading-[1.3] text-ink">
          {reflection.focus.theme}
        </p>
        <p className="mt-1.5 text-[13px] font-medium leading-[1.55] text-ink-soft">
          {reflection.focus.practice}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {reflection.focus.modules.map((m) => (
            <span
              key={m}
              className="rounded-pill bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-text"
            >
              {FOCUS_MODULE_LABEL[m] ?? m}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
