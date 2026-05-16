// Pure EQ — Coach step component (Coach SOT 2026-05-06).
//
// Three voice-enabled textareas stacked, each with its own micro-label.
// Used for "lesson"-style triadic Qs where the user must articulate three
// related-but-distinct fields on one screen — e.g. fairest_version /
// predicted_reaction / hidden_expectation in Prepare. Stored as a flat
// `{ a, b, c }` triple; consumer renames at the persistence boundary.

"use client";

import { VoiceInput } from "@/components/voice-input";

export type TextareaThreeFieldLessonValue = {
  a: string;
  b: string;
  c: string;
};

type Props = {
  value: TextareaThreeFieldLessonValue | undefined;
  onChange: (next: TextareaThreeFieldLessonValue) => void;
  labelA: string;
  labelB: string;
  labelC: string;
  placeholderA?: string;
  placeholderB?: string;
  placeholderC?: string;
  /** Rows for the REQUIRED first field. Default 3. */
  rows?: number;
  /** Rows for the OPTIONAL b/c fields. Default 2 — keeps the page short
   *  on dense pages like Review Full Page 5. */
  rowsOptional?: number;
};

export function TextareaThreeFieldLesson({
  value,
  onChange,
  labelA,
  labelB,
  labelC,
  placeholderA = "",
  placeholderB = "",
  placeholderC = "",
  rows = 3,
  rowsOptional = 2,
}: Props) {
  const a = value?.a ?? "";
  const b = value?.b ?? "";
  const c = value?.c ?? "";
  // SOT 2026-05-08 fix4: space-y-3 (was -4) + rowsOptional 2 (was 3 across
  // all 3) drops ~140px on Review Full Page 5 where this component renders
  // between whatProtecting + the calibration/standalone middle. Required
  // field a stays at rows=3.
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          {labelA}
        </p>
        <VoiceInput
          value={a}
          onChange={(next) => onChange({ a: next, b, c })}
          rows={rows}
          placeholder={placeholderA}
        />
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          {labelB}
        </p>
        <VoiceInput
          value={b}
          onChange={(next) => onChange({ a, b: next, c })}
          rows={rowsOptional}
          placeholder={placeholderB}
        />
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          {labelC}
        </p>
        <VoiceInput
          value={c}
          onChange={(next) => onChange({ a, b, c: next })}
          rows={rowsOptional}
          placeholder={placeholderC}
        />
      </div>
    </div>
  );
}
