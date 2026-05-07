// Pure EQ — Coach step component (Coach SOT 2026-05-06).
//
// Repair-branch timing combo: free-text "when" + boolean "is now that
// moment?" toggle. Stored as { when, isNowThatMoment }. AI's
// `recommended_timing` field uses both halves — `when` describes the
// window the user is willing to wait for; the boolean tells the AI whether
// to encourage acting now or holding back.

"use client";

import { VoiceInput } from "@/components/voice-input";

export type TimingComboValue = {
  when: string;
  isNowThatMoment: boolean;
};

type Props = {
  value: TimingComboValue | undefined;
  onChange: (next: TimingComboValue) => void;
  whenLabel?: string;
  whenPlaceholder?: string;
};

export function TimingCombo({
  value,
  onChange,
  whenLabel = "When could this land best?",
  whenPlaceholder = "A window of time — tomorrow morning, after dinner, this weekend.",
}: Props) {
  const when = value?.when ?? "";
  // Default to false — user must affirmatively flip it. Avoids a "yes" by
  // accident on a step the user isn't focused on.
  const isNowThatMoment = value?.isNowThatMoment ?? false;
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          {whenLabel}
        </p>
        <VoiceInput
          value={when}
          onChange={(next) => onChange({ when: next, isNowThatMoment })}
          rows={3}
          placeholder={whenPlaceholder}
        />
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={isNowThatMoment}
          onChange={(e) =>
            onChange({ when, isNowThatMoment: e.target.checked })
          }
          className="mt-1 h-5 w-5 cursor-pointer accent-brand"
        />
        <span className="text-[14px] font-medium leading-[1.45] text-ink">
          Is now that moment?
        </span>
      </label>
    </div>
  );
}
