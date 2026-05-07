// Pure EQ — Coach step component (Coach SOT 2026-05-06).
//
// Pulse Check "What's your next move?" 7-chip selector. Drives the
// result-screen routing matrix on submit (wait_observe → close,
// regulate_first → /tools/overwhelmed, ask_clarifying → BYS,
// prepare_conversation → /coach/prepare, use_bys → /coach/before-send,
// review → /coach/review, do_nothing → close).
//
// Set-then-submit override pattern not used here — the chip choice does
// NOT change downstream page count (Q10 "lightCheckQuestion" is on the
// SAME page as this chip via intra-page conditional). Consumer simply
// `setFieldValue("nextMoveChip", value)` and the conditional redraws.

"use client";

import { PULSE_NEXT_MOVE_VALUES } from "@/lib/validation";

type PulseNextMove = (typeof PULSE_NEXT_MOVE_VALUES)[number];

const LABELS: Record<PulseNextMove, string> = {
  wait_observe: "Wait and observe",
  regulate_first: "Regulate first",
  ask_clarifying: "Ask a clarifying question",
  prepare_conversation: "Prepare a conversation",
  use_bys: "Use Before-You-Send",
  review: "Review what already happened",
  do_nothing: "Do nothing",
};

type Props = {
  value: string | undefined;
  onChange: (next: PulseNextMove) => void;
};

export function SelectSignalNextMove({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      {PULSE_NEXT_MOVE_VALUES.map((chip) => {
        const selected = value === chip;
        return (
          <button
            key={chip}
            type="button"
            onClick={() => onChange(chip)}
            className={`flex min-h-12 w-full items-center rounded-card-sm px-4 py-3 text-left text-[14px] font-semibold transition active:scale-[0.99] ${
              selected
                ? "bg-brand text-white shadow-cta"
                : "bg-surface text-ink shadow-soft"
            }`}
          >
            {LABELS[chip]}
          </button>
        );
      })}
    </div>
  );
}
