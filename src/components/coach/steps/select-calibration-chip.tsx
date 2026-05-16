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
import {
  CALIBRATION_COMPARE_VALUES,
  CALIBRATION_SHIFT_VALUES,
  CALIBRATION_FLOOR_VALUES,
} from "@/lib/validation";

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

// SOT 2026-05-08 fix2: chip VALUE enums live in validation.ts so the
// server-side Zod schema and the client UI can't drift. Labels are
// UI-only and stay here.
const COMPARE_LABELS: Record<(typeof CALIBRATION_COMPARE_VALUES)[number], string> = {
  better: "Better than expected",
  about_right: "About right",
  worse: "Worse than expected",
};
const SHIFT_LABELS: Record<(typeof CALIBRATION_SHIFT_VALUES)[number], string> = {
  yes: "Yes",
  partial: "Partial",
  no: "No",
  too_soon: "Too soon to tell",
};
const FLOOR_LABELS: Record<(typeof CALIBRATION_FLOOR_VALUES)[number], string> = {
  yes: "Yes",
  mostly: "Mostly",
  no: "No",
};

const CHIPS_BY_SET: Record<
  CalibrationChipSet,
  readonly { value: string; label: string }[]
> = {
  compare: CALIBRATION_COMPARE_VALUES.map((v) => ({
    value: v,
    label: COMPARE_LABELS[v],
  })),
  shift: CALIBRATION_SHIFT_VALUES.map((v) => ({
    value: v,
    label: SHIFT_LABELS[v],
  })),
  floor: CALIBRATION_FLOOR_VALUES.map((v) => ({
    value: v,
    label: FLOOR_LABELS[v],
  })),
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
            className={`flex min-h-11 items-center rounded-pill px-3.5 text-[13px] font-semibold transition active:scale-[0.99] ${
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
