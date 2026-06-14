"use client";

import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import { EditableCard } from "@/components/coach/editable-card";

// Shared renderer for a Prepare entry's AI cards. Used by the live result
// screen (right after generation) AND the past-entry view page (Conversations →
// entry). When entryId is set, each card is an EditableCard (Accept/Edit/Not-
// true); without one it falls back to a read-only card. classified_primary/
// _secondary drive the stored type and are intentionally NOT rendered.

export type PrepareAiNormal = {
  mode: "normal";
  // Quick (4 coins) — 6 framing cards.
  conversation_mode: string;
  classified_primary: string;
  classified_secondary: string | null;
  hot_layer: string;
  goal_gap: string;
  posture: string;
  do_dont: string;
  carry_in: string;
  // Deep (6 coins) — the original 5, present only on Deep output.
  pressure_check?: string;
  cleaner_opener?: string;
  predicted_reaction?: string;
  neutral_check_question?: string;
  deeper_read?: string;
  pattern_tag: string;
};

export type PrepareAiRefusal = {
  mode: "refusal";
  refusal_reason: string;
  message_to_user: string;
  suggested_resource: string;
};

export type PrepareAiOutput = PrepareAiNormal | PrepareAiRefusal;

// Order = how the cards stack. The 6 framing cards (Quick, always present)
// first, then the original 5 (Deep only) — each falls out when its string is
// absent/empty.
export const PREPARE_RESULT_FIELDS: {
  label: string;
  key: keyof PrepareAiNormal;
}[] = [
  { label: "What this really is", key: "conversation_mode" },
  { label: "The hot layer", key: "hot_layer" },
  { label: "The goal gap", key: "goal_gap" },
  { label: "The posture to hold", key: "posture" },
  { label: "One do, one don't", key: "do_dont" },
  { label: "Carry this in", key: "carry_in" },
  { label: "Pressure check", key: "pressure_check" },
  { label: "A cleaner opener", key: "cleaner_opener" },
  { label: "Predicted reaction", key: "predicted_reaction" },
  { label: "Neutral check question", key: "neutral_check_question" },
  { label: "A deeper read", key: "deeper_read" },
];

export function PrepareResultCards({
  output,
  entryId,
}: {
  output: PrepareAiNormal;
  entryId: string | null;
}) {
  const visible = PREPARE_RESULT_FIELDS.filter(({ key }) => {
    const v = output[key];
    return typeof v === "string" && v.trim().length > 0;
  });
  return (
    <div className="space-y-3">
      {visible.map(({ label, key }) => {
        const text = output[key] as string;
        return entryId ? (
          <EditableCard
            key={key}
            label={label}
            value={text}
            cardKey={key}
            entryTable="prepare_entries"
            entryId={entryId}
          />
        ) : (
          <Card key={key} className="animate-card-in">
            <Kicker>{label}</Kicker>
            <p className="mt-1.5 whitespace-pre-line break-words text-[14px] font-medium leading-[1.5] text-ink">
              {text}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
