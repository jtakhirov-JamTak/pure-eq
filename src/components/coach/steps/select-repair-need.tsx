// Pure EQ — Coach step component (Coach SOT 2026-05-06).
//
// Review Repair branch "what they need first" 5-chip selector. Drives both
// the Repair branch field (`their_need_first`) AND the AI's
// `recommended_timing` derivation. Used inside the Repair sub-flow when
// `needsToHappenNext ∈ REPAIR_TRIGGER_NEEDS`.

"use client";

import { THEIR_NEED_FIRST_VALUES } from "@/lib/validation";

type TheirNeedFirst = (typeof THEIR_NEED_FIRST_VALUES)[number];

const LABELS: Record<TheirNeedFirst, string> = {
  acknowledgment: "Acknowledgment",
  clarity: "Clarity",
  safety: "Safety",
  space: "Space",
  boundary: "A clear boundary",
};

type Props = {
  value: string | undefined;
  onChange: (next: TheirNeedFirst) => void;
};

export function SelectRepairNeed({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      {THEIR_NEED_FIRST_VALUES.map((chip) => {
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
