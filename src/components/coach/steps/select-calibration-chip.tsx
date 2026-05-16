// Pure EQ — Coach step component (Coach SOT 2026-05-08 follow-up).
//
// Single chip row keyed by `chipSet` ("compare" | "shift" | "floor"). Each
// row renders the SOT chip taxonomy for that prediction-vs-outcome question:
//
//   compare — was the conversation better/about_right/worse than predicted?
//   shift   — did the specific shift you asked for actually happen?
//   floor   — did you hit the good-enough outcome you set?
//
// Page-5-calibration on Full Review renders three of these as separate
// step instances with distinct titles; submit handler combines the three
// string state values into `calibration_block: { compare, shift, floor }`.
//
// Previous shape rendered all 3 rows in one component instance — replaced
// because the SOT requires each Q to have its own full-size title, prompt,
// and step progression so the cognitive op (compare prediction vs reality
// on one specific dimension) lands clearly.

"use client";

import type { CalibrationChipSet } from "@/lib/coach/page-flow";

/**
 * Combined submit-time value. Constructed at the page level from three
 * separate string state keys (`calibrationCompare`, `calibrationShift`,
 * `calibrationFloor`); not held in component state.
 */
export type CalibrationBlockValue = {
  compare: string;
  shift: string;
  floor: string;
};

const COMPARE_CHIPS = [
  { value: "better", label: "Better than expected" },
  { value: "about_right", label: "About right" },
  { value: "worse", label: "Worse than expected" },
] as const;

const SHIFT_CHIPS = [
  { value: "yes", label: "Yes" },
  { value: "partial", label: "Partial" },
  { value: "no", label: "No" },
  { value: "too_soon", label: "Too soon to tell" },
] as const;

const FLOOR_CHIPS = [
  { value: "yes", label: "Yes" },
  { value: "mostly", label: "Mostly" },
  { value: "no", label: "No" },
] as const;

const CHIPS_BY_SET: Record<
  CalibrationChipSet,
  readonly { value: string; label: string }[]
> = {
  compare: COMPARE_CHIPS,
  shift: SHIFT_CHIPS,
  floor: FLOOR_CHIPS,
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  chipSet: CalibrationChipSet;
};

export function SelectCalibrationChip({ value, onChange, chipSet }: Props) {
  const chips = CHIPS_BY_SET[chipSet];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-pill px-3.5 py-2 text-[13px] font-semibold transition active:scale-[0.99] ${
              isSelected
                ? "bg-brand text-white shadow-cta"
                : "bg-surface-tint text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
