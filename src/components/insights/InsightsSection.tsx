"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { formatLocalDate } from "@/lib/utils";

// ============================================================
// InsightsSection — collapsible weekly/monthly section with history browse
// ============================================================
// A disclosure card whose header shows the title + the active item's period
// ("for which week/month") + generated date. Collapsed by default. When
// expanded it shows (optionally) a Generate CTA, then a ‹ Older / Newer ›
// browser across the user's prior reports of this type.
//
// Each browsable report is passed as one `{ item, card }` entry (newest first):
// the heavy `card` markup is rendered server-side and ships as a serialized
// element, while this client component only owns the open/closed + browse-index
// state. item + card travel together so the displayed card can never drift from
// the header's period/date (that date is the silent-writer canary).

export interface InsightsHistoryItem {
  generatedAt: string; // ISO
  periodStart: string; // ISO
  periodEnd: string; // ISO
}

export interface InsightsEntry {
  item: InsightsHistoryItem;
  card: ReactNode;
}

interface Props {
  title: string;
  // Noun for the "a new X is ready to generate" hint ("reflection" / "report").
  noun: string;
  // Newest-first browsable history (item + its rendered card, together).
  entries: InsightsEntry[];
  // Generate CTA / locked card, rendered at the top of the expanded body.
  generateSlot?: ReactNode;
  // Drives the collapsed-header accent hint inviting the user to expand.
  generateAvailable?: boolean;
  // Shown as the collapsed sub-line when there are no past reports yet.
  collapsedHint?: string;
  defaultOpen?: boolean;
}

export function InsightsSection({
  title,
  noun,
  entries,
  generateSlot,
  generateAvailable,
  collapsedHint,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  // 0 = newest. Clamp on read so a shrinking list can't strand the index.
  const [idx, setIdx] = useState(0);
  const bodyId = useId();

  const hasItems = entries.length > 0;
  const safeIdx = hasItems ? Math.min(idx, entries.length - 1) : 0;
  const active = hasItems ? entries[safeIdx].item : null;

  const subline = active
    ? `${formatLocalDate(active.periodStart, { month: "short", day: "numeric" })} – ${formatLocalDate(active.periodEnd, { month: "short", day: "numeric" })} · generated ${formatLocalDate(active.generatedAt)}`
    : (collapsedHint ?? "");

  return (
    <section className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-3 rounded-card border border-hairline bg-surface p-5 text-left transition active:scale-[0.99]"
      >
        <span className="min-w-0 flex-1">
          {/* Real <h2> so the section stays in the screen-reader heading
              outline (the cards render with hideHeader, so this is the only
              heading for the section). Tailwind preflight resets h2 sizing, so
              it looks identical to a styled span. */}
          <h2
            className="block font-display text-[18px] font-medium leading-[1.2] text-ink"
            style={{ letterSpacing: "-0.3px" }}
          >
            {title}
          </h2>
          {subline && (
            <span className="mt-1 block text-[12px] font-medium leading-[1.4] text-ink-soft">
              {subline}
            </span>
          )}
          {generateAvailable && (
            <span className="mt-1 block text-[12px] font-semibold leading-[1.4] text-accent-ink">
              A new {noun} is ready to generate.
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div id={bodyId}>
          {generateSlot}

          {hasItems && (
            <>
              {entries.length > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setIdx(Math.min(entries.length - 1, safeIdx + 1))}
                    disabled={safeIdx >= entries.length - 1}
                    aria-label="Older"
                    className="inline-flex min-h-11 items-center gap-1 rounded-pill px-3 text-[13px] font-semibold text-accent-ink disabled:opacity-40"
                  >
                    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    Older
                  </button>
                  {/* Live region: browsing swaps the card in place, so announce
                      the position change to screen readers (WCAG 4.1.3). */}
                  <span
                    aria-live="polite"
                    aria-atomic="true"
                    className="text-[12px] font-medium text-ink-soft"
                  >
                    {safeIdx + 1} of {entries.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIdx(Math.max(0, safeIdx - 1))}
                    disabled={safeIdx <= 0}
                    aria-label="Newer"
                    className="inline-flex min-h-11 items-center gap-1 rounded-pill px-3 text-[13px] font-semibold text-accent-ink disabled:opacity-40"
                  >
                    Newer
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              )}
              {entries[safeIdx].card}
            </>
          )}
        </div>
      )}
    </section>
  );
}
