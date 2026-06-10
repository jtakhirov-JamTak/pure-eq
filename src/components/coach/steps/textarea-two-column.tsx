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
    // Two stacked voice fields don't fit the no-scroll budget: splitting the
    // region in half and letting each VoiceInput's chrome (label + mic bar +
    // hint + redo) eat its share collapses each textarea to ~0px once the
    // keyboard shrinks the viewport, hiding typed/transcribed text entirely.
    // So this step is the deliberate exception that scrolls — fixed-height
    // inputs in an overflow-y-auto column. At rest (keyboard closed) the two
    // fields fit without scrolling; with the keyboard open the user scrolls
    // within the step while the pinned FlowScreen footer/header stay put.
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
        <div className="shrink-0">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
            {leftLabel}
          </p>
          <VoiceInput
            value={left}
            onChange={(next) => onChange({ left: next, right })}
            rows={3}
            placeholder={leftPlaceholder}
          />
        </div>
        <div className="shrink-0">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
            {rightLabel}
          </p>
          <VoiceInput
            value={right}
            onChange={(next) => onChange({ left, right: next })}
            rows={3}
            placeholder={rightPlaceholder}
          />
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
