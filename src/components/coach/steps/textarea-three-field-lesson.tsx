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
  rows?: number;
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
}: Props) {
  const a = value?.a ?? "";
  const b = value?.b ?? "";
  const c = value?.c ?? "";
  return (
    <div className="space-y-4">
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
          rows={rows}
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
          rows={rows}
          placeholder={placeholderC}
        />
      </div>
    </div>
  );
}
