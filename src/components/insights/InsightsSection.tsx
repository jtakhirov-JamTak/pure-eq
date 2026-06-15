"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

// ============================================================
// InsightsSection — collapsible weekly/monthly section with history browse
// ============================================================
// A disclosure card whose header shows the title + the active item's period
// ("for which week/month") + generated date. Collapsed by default. When
// expanded it shows (optionally) a Generate CTA, then a ‹ Older / Newer ›
// browser across the user's prior reports of this type.
//
// The report cards are rendered server-side and passed in as `cards` (aligned
// with `items`, newest first) — this component only owns the open/closed state
// and the browse index, so the heavy card markup stays on the server.

function formatDate(input: string): string {
  // Bare YYYY-MM-DD parses as UTC midnight — west of UTC that renders the
  // previous day. Parse the parts into a local date (matches the cards).
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  const d = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShort(input: string): string {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  const d = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface InsightsHistoryItem {
  generatedAt: string; // ISO
  periodStart: string; // ISO
  periodEnd: string; // ISO
}

interface Props {
  title: string;
  // Noun for the "a new X is ready to generate" hint ("reflection" / "report").
  noun: string;
  // Newest-first. cards[i] is the rendered card for items[i].
  items: InsightsHistoryItem[];
  cards: ReactNode[];
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
  items,
  cards,
  generateSlot,
  generateAvailable,
  collapsedHint,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  // 0 = newest. Clamp on read so a shrinking list can't strand the index.
  const [idx, setIdx] = useState(0);

  const hasItems = items.length > 0;
  const safeIdx = hasItems ? Math.min(idx, items.length - 1) : 0;
  const active = hasItems ? items[safeIdx] : null;

  const subline = active
    ? `${formatShort(active.periodStart)} – ${formatShort(active.periodEnd)} · generated ${formatDate(active.generatedAt)}`
    : (collapsedHint ?? "");

  return (
    <section className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-card border border-hairline bg-surface p-5 text-left transition active:scale-[0.99]"
      >
        <span className="min-w-0 flex-1">
          <span
            className="block font-display text-[18px] font-medium leading-[1.2] text-ink"
            style={{ letterSpacing: "-0.3px" }}
          >
            {title}
          </span>
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
        <div>
          {generateSlot}

          {hasItems && (
            <>
              {items.length > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setIdx(Math.min(items.length - 1, safeIdx + 1))}
                    disabled={safeIdx >= items.length - 1}
                    aria-label="Older"
                    className="inline-flex min-h-11 items-center gap-1 rounded-pill px-3 text-[13px] font-semibold text-accent-ink disabled:opacity-40"
                  >
                    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    Older
                  </button>
                  <span className="text-[12px] font-medium text-ink-soft">
                    {safeIdx + 1} of {items.length}
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
              {cards[safeIdx]}
            </>
          )}
        </div>
      )}
    </section>
  );
}
