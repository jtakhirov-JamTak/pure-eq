"use client";

import { useState } from "react";
import { VoiceInput } from "@/components/voice-input";
import type { AiCardEntryTable, CardEditStatus } from "@/types";

// ============================================================
// EditableCard — Accept / Edit / Not-true on one AI coaching card
// ============================================================
// Coins redesign Slice A. Each AI card is interactive: the user can keep it
// (Accept), rewrite it (Edit — the edited text becomes the version of record),
// or reject it (Not true). The verdict is persisted via POST /api/coach/card-
// edit, keyed by (entryTable, entryId, cardKey). For the Prepare Predicted
// Reaction card the endpoint also syncs the predicted_reaction column so
// Review calibration reads the corrected/withdrawn forecast.
//
// Failure is non-destructive: a failed save shows an inline retry and leaves
// the card in its prior state — the AI text is never lost.

export function EditableCard({
  label,
  value,
  cardKey,
  entryTable,
  entryId,
  isAction = false,
}: {
  label: string;
  value: string;
  cardKey: string;
  entryTable: AiCardEntryTable;
  entryId: string;
  isAction?: boolean;
}) {
  const [status, setStatus] = useState<CardEditStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The text currently shown: the edited version once saved, else the AI's.
  const displayText = status === "edited" ? draft : value;
  const rejected = status === "not_true";

  async function persist(next: CardEditStatus, editedText?: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/card-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryTable,
          entryId,
          cardKey,
          status: next,
          editedText: editedText ?? null,
          originalText: value,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setStatus(next);
      setEditing(false);
    } catch (err) {
      console.error("card-edit failed", (err as Error)?.message);
      setError("Couldn't save — tap to dismiss, then retry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded-card-sm bg-surface p-4 shadow-soft ${
        isAction ? "animate-action-in" : "animate-card-in"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
          {label}
        </p>
        {status && !editing && (
          <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-ink-muted">
            {status === "accepted"
              ? "Kept"
              : status === "edited"
                ? "Edited"
                : "Marked not true"}
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <VoiceInput
            value={draft}
            onChange={setDraft}
            rows={4}
            placeholder="Rewrite this in your own words…"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving || draft.trim().length === 0}
              onClick={() => persist("edited", draft.trim())}
              className="flex min-h-11 flex-1 items-center justify-center rounded-pill bg-accent px-4 text-[13px] font-semibold text-accent-text shadow-cta active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setDraft(status === "edited" ? draft : value);
                setError(null);
              }}
              className="flex min-h-11 items-center justify-center rounded-pill bg-surface-tint px-4 text-[13px] font-semibold text-ink active:opacity-80"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p
            className={`mt-1.5 whitespace-pre-line break-words text-[14px] font-medium leading-[1.5] ${
              rejected ? "text-ink-muted line-through" : "text-ink"
            }`}
          >
            {displayText}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => persist("accepted")}
              className={`flex min-h-11 items-center justify-center rounded-pill px-3 text-[12px] font-semibold active:opacity-80 disabled:opacity-40 ${
                status === "accepted"
                  ? "bg-accent text-accent-text"
                  : "bg-surface-tint text-ink"
              }`}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft(displayText);
                setEditing(true);
                setError(null);
              }}
              className="flex min-h-11 items-center justify-center rounded-pill bg-surface-tint px-3 text-[12px] font-semibold text-ink active:opacity-80 disabled:opacity-40"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => persist("not_true")}
              className={`flex min-h-11 items-center justify-center rounded-pill px-3 text-[12px] font-semibold active:opacity-80 disabled:opacity-40 ${
                status === "not_true"
                  ? "bg-danger text-white"
                  : "bg-surface-tint text-ink"
              }`}
            >
              Not true
            </button>
          </div>
        </>
      )}

      {error && (
        <button
          type="button"
          onClick={() => setError(null)}
          className="mt-2 inline-flex min-h-11 items-center px-2 text-left text-[12px] font-medium text-danger underline"
        >
          {error}
        </button>
      )}
    </div>
  );
}
