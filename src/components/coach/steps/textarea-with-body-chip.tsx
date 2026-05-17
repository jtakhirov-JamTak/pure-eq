// Pure EQ — Coach step component (Coach SOT 2026-05-06).
//
// A single textarea (voice-enabled) paired with a body-location chip
// selector below. Used in Prepare (`body_location` companion to the opener
// field) and Pulse Check (`feelingAndBody.bodyLocation` paired with
// `feelingAndBody.text`). Body chip set is configurable per consumer:
// Prepare uses BODY_LOCATION_VALUES (8 chips); Pulse Check uses
// BODY_LOCATION_PULSE_VALUES (8 + `fuzzy_cant_tell`).

"use client";

import { VoiceInput } from "@/components/voice-input";

export type TextareaWithBodyChipValue = {
  text: string;
  bodyLocation: string;
};

type Props = {
  value: TextareaWithBodyChipValue | undefined;
  onChange: (next: TextareaWithBodyChipValue) => void;
  /** Allowed body-location chip values. Labels resolved via labelFor. */
  chipValues: readonly string[];
  /**
   * Maps a chip value to display label. Consumer owns the mapping so the
   * step component stays domain-agnostic. Falls back to titlecasing if
   * unmapped (defensive only — should not fire in practice).
   */
  labelFor?: (chip: string) => string;
  textareaRows?: number;
  textareaPlaceholder?: string;
};

const FALLBACK_LABELS: Record<string, string> = {
  throat: "Throat",
  chest: "Chest",
  stomach: "Stomach",
  jaw: "Jaw",
  shoulders: "Shoulders",
  face: "Face",
  other: "Other",
  dont_notice: "Don't notice",
  fuzzy_cant_tell: "Fuzzy / can't tell",
};

function defaultLabelFor(chip: string): string {
  return (
    FALLBACK_LABELS[chip] ??
    chip.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function TextareaWithBodyChip({
  value,
  onChange,
  chipValues,
  labelFor = defaultLabelFor,
  textareaRows = 4,
  textareaPlaceholder = "Type or tap the mic to speak…",
}: Props) {
  const text = value?.text ?? "";
  const bodyLocation = value?.bodyLocation ?? "";

  return (
    <div className="space-y-3">
      <VoiceInput
        value={text}
        onChange={(next) => onChange({ text: next, bodyLocation })}
        rows={textareaRows}
        placeholder={textareaPlaceholder}
      />
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          Where in your body?
        </p>
        <div className="flex flex-wrap gap-2">
          {chipValues.map((chip) => {
            const selected = bodyLocation === chip;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => onChange({ text, bodyLocation: chip })}
                className={`flex min-h-11 items-center rounded-pill px-3.5 py-2 text-[13px] font-semibold transition active:scale-[0.99] ${
                  selected
                    ? "bg-brand text-white shadow-cta"
                    : "bg-surface-tint text-ink"
                }`}
              >
                {labelFor(chip)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
