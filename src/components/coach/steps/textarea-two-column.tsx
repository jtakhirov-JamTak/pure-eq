// Pure EQ — Coach step component (Coach SOT 2026-05-06).
//
// Two voice-enabled textareas side-by-side on tablet+, stacked on phone.
// Promoted from Review's `observedInterpreted` step. Generic over the two
// labels and field shapes — used by:
//   - Review base flow: observedRaw / interpretedRaw
//   - Pulse Check: storyAndAlternative.story / .alternative
//
// Stored value is a single `{ left, right }` shape; consumer maps to/from
// the API field names per their schema.

"use client";

import { VoiceInput } from "@/components/voice-input";

export type TextareaTwoColumnValue = {
  left: string;
  right: string;
};

type Props = {
  value: TextareaTwoColumnValue | undefined;
  onChange: (next: TextareaTwoColumnValue) => void;
  leftLabel: string;
  rightLabel: string;
  leftPlaceholder?: string;
  rightPlaceholder?: string;
  rows?: number;
  /**
   * No-scroll FlowScreen mode: stack the two voice fields and split the
   * available vertical space between them (each grows to fill its half)
   * instead of using a fixed `rows` height. Used by the one-question-per-screen
   * coach flows so the two-column step fits without scrolling.
   */
  fill?: boolean;
};

export function TextareaTwoColumn({
  value,
  onChange,
  leftLabel,
  rightLabel,
  leftPlaceholder = "",
  rightPlaceholder = "",
  rows = 4,
  fill,
}: Props) {
  const left = value?.left ?? "";
  const right = value?.right ?? "";

  if (fill) {
    // Two halves of one flex column. Each column wraps the VoiceInput in a
    // flex-1 box so the input's `h-full` resolves against the space left after
    // its label — the two inputs evenly share the main region, no scroll.
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-1.5 shrink-0 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
            {leftLabel}
          </p>
          <div className="flex min-h-0 flex-1 flex-col">
            <VoiceInput
              value={left}
              onChange={(next) => onChange({ left: next, right })}
              fill
              placeholder={leftPlaceholder}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-1.5 shrink-0 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
            {rightLabel}
          </p>
          <div className="flex min-h-0 flex-1 flex-col">
            <VoiceInput
              value={right}
              onChange={(next) => onChange({ left, right: next })}
              fill
              placeholder={rightPlaceholder}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          {leftLabel}
        </p>
        <VoiceInput
          value={left}
          onChange={(next) => onChange({ left: next, right })}
          rows={rows}
          placeholder={leftPlaceholder}
        />
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          {rightLabel}
        </p>
        <VoiceInput
          value={right}
          onChange={(next) => onChange({ left, right: next })}
          rows={rows}
          placeholder={rightPlaceholder}
        />
      </div>
    </div>
  );
}
