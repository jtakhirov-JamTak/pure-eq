// Pure EQ — Coach step component (Coach SOT 2026-05-06).
//
// A voice-enabled textarea seeded with implementation-intention scaffolding
// ("If I notice ___, then I will ___"). Stored as a single string — the
// user is expected to inline both halves; the schema validates non-empty
// content and AI-side prompts can extract structure post-hoc.
//
// Kept distinct from plain `textarea` so the consumer page can render
// stronger prompt copy + a longer placeholder. Single-string output means
// no migration overhead vs the existing `triggerPlan` field shape.

"use client";

import { VoiceInput } from "@/components/voice-input";

type Props = {
  value: string | undefined;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
};

const DEFAULT_PLACEHOLDER =
  "If I notice myself feeling ___, then I will ___.";

export function TextareaIfThen({
  value,
  onChange,
  placeholder = DEFAULT_PLACEHOLDER,
  rows = 4,
}: Props) {
  return (
    <VoiceInput
      value={value ?? ""}
      onChange={onChange}
      rows={rows}
      placeholder={placeholder}
    />
  );
}
