// Pure EQ — Coach step component (Coach SOT 2026-05-06).
//
// Review calibration block: 3 chip rows on one screen, each picking one
// chip from its respective set. Stored as { compare, shift, floor: string
// }. Schema (calibrationBlockSchema) only enforces non-empty strings;
// chip-id enums are owned by the consumer — see
// review/page.tsx for the actual chip lists landing in Commit 5.
//
// Render only when Page 5 of Full Review is in calibration mode (i.e.
// `linkedPrepareEntryId != null`). The mutually-exclusive standalone
// branch on Page 5 uses the textarea_two_column kind instead.

"use client";

export type CalibrationChips = {
  compare: readonly { value: string; label: string }[];
  shift: readonly { value: string; label: string }[];
  floor: readonly { value: string; label: string }[];
};

export type CalibrationBlockValue = {
  compare: string;
  shift: string;
  floor: string;
};

type Props = {
  value: CalibrationBlockValue | undefined;
  onChange: (next: CalibrationBlockValue) => void;
  chips: CalibrationChips;
  compareLabel?: string;
  shiftLabel?: string;
  floorLabel?: string;
};

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: readonly { value: string; label: string }[];
  selected: string;
  onSelect: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
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

export function SelectCalibrationChip({
  value,
  onChange,
  chips,
  compareLabel = "How did the conversation compare to your forecast?",
  shiftLabel = "What shifted between forecast and reality?",
  floorLabel = "What's your floor for next time?",
}: Props) {
  const compare = value?.compare ?? "";
  const shift = value?.shift ?? "";
  const floor = value?.floor ?? "";
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          {compareLabel}
        </p>
        <ChipRow
          options={chips.compare}
          selected={compare}
          onSelect={(next) => onChange({ compare: next, shift, floor })}
        />
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          {shiftLabel}
        </p>
        <ChipRow
          options={chips.shift}
          selected={shift}
          onSelect={(next) => onChange({ compare, shift: next, floor })}
        />
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          {floorLabel}
        </p>
        <ChipRow
          options={chips.floor}
          selected={floor}
          onSelect={(next) => onChange({ compare, shift, floor: next })}
        />
      </div>
    </div>
  );
}
