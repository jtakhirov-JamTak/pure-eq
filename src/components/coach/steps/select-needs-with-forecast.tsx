// Pure EQ — Coach step component (Coach SOT 2026-05-06).
//
// Review "what needs to happen next?" 8-chip selector PLUS a free-text
// "what do you forecast will happen?" companion. Stored as { chip,
// forecast }. Forecast is required (per spec — separates this from the
// optional-text protecting selector).
//
// IMPORTANT for consumer (Review page in Commit 5/6):
// The chip choice changes downstream page count (REPAIR_TRIGGER_NEEDS
// chips activate Repair sub-pages on Full Review). Consumer must use the
// set-then-submit override pattern (feedback_dynamic_steps_submit_branching)
// when the chip click also has to advance — i.e., on Full Review, advancing
// past this Q after a non-repair chip should call handleSubmit({ override })
// rather than setStep(+1) past the repair pages that won't render.

"use client";

import { VoiceInput } from "@/components/voice-input";
import { REVIEW_NEEDS_NEXT_VALUES } from "@/lib/validation";

type NeedsNext = (typeof REVIEW_NEEDS_NEXT_VALUES)[number];

const LABELS: Record<NeedsNext, string> = {
  nothing: "Nothing — I'm good with how it landed",
  clarify: "Clarify something I said",
  align: "Get back on the same page",
  apologize: "Apologize",
  reassure: "Reassure them",
  give_space: "Give it space",
  set_boundary: "Set a boundary",
  ask_for_repair: "Ask them to repair something",
};

export type SelectNeedsWithForecastValue = {
  chip: string;
  forecast: string;
};

type Props = {
  value: SelectNeedsWithForecastValue | undefined;
  onChange: (next: SelectNeedsWithForecastValue) => void;
  forecastLabel?: string;
  forecastPlaceholder?: string;
};

export function SelectNeedsWithForecast({
  value,
  onChange,
  forecastLabel = "What do you forecast will happen?",
  forecastPlaceholder = "Your honest prediction — best guess or worst guess.",
}: Props) {
  const chip = value?.chip ?? "";
  const forecast = value?.forecast ?? "";
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {REVIEW_NEEDS_NEXT_VALUES.map((c) => {
          const selected = chip === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ chip: c, forecast })}
              className={`flex min-h-12 w-full items-center rounded-card-sm px-4 py-3 text-left text-[14px] font-semibold transition active:scale-[0.99] ${
                selected
                  ? "bg-brand text-white shadow-cta"
                  : "bg-surface text-ink shadow-soft"
              }`}
            >
              {LABELS[c]}
            </button>
          );
        })}
      </div>
      {chip && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
            {forecastLabel}
          </p>
          <VoiceInput
            value={forecast}
            onChange={(next) => onChange({ chip, forecast: next })}
            rows={3}
            placeholder={forecastPlaceholder}
          />
        </div>
      )}
    </div>
  );
}
