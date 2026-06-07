"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { ConversationSummary } from "@/lib/coach/conversation-summary";
import {
  bulkDeleteConversations,
  bulkUpdateThreadStatus,
} from "@/app/(app)/conversations/all/actions";

// Origin chips: how the conversation started.
const ORIGIN_LABELS: Record<string, { label: string; className: string }> = {
  prepare: { label: "Prepared", className: "bg-accent-soft text-accent-ink" },
  pulse_check: {
    label: "Something felt off",
    className: "bg-accent-soft text-accent-ink",
  },
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-accent-soft text-accent-ink" },
  stabilizing: { label: "Stabilizing", className: "bg-warm-soft text-warm" },
  resolved: { label: "Resolved", className: "bg-positive/15 text-positive" },
  paused: { label: "Paused", className: "bg-surface-tint text-ink-soft" },
  worsened: { label: "Worsened", className: "bg-danger/15 text-[#ec9a8f]" },
  ended: { label: "Ended", className: "bg-surface-tint text-ink-soft" },
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "stabilizing", label: "Stabilizing" },
  { value: "resolved", label: "Resolved" },
  { value: "paused", label: "Paused" },
  { value: "worsened", label: "Worsened" },
  { value: "ended", label: "Ended" },
] as const;

// The "All conversations" list with an opt-in multi-select mode. Out of select
// mode each card is a Link to its detail view (unchanged behavior). In select
// mode cards toggle a checkbox instead of navigating, and a bottom action bar
// applies a bulk delete or a bulk status change to the whole selection.
export function AllConversationsList({
  conversations,
}: {
  conversations: ConversationSummary[];
}) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    setError(null);
    setShowDeleteConfirm(false);
  }

  function toggle(threadId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === conversations.length
        ? new Set()
        : new Set(conversations.map((c) => c.threadId)),
    );
  }

  async function applyStatus(newStatus: string) {
    if (busy || selected.size === 0 || !newStatus) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bulkUpdateThreadStatus([...selected], newStatus);
      if (!result.success) throw new Error(result.error ?? "Update failed");
      exitSelect();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function confirmDelete() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bulkDeleteConversations([...selected]);
      if (!result.success) throw new Error(result.error ?? "Delete failed");
      exitSelect();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const count = selected.size;
  const allSelected = count > 0 && count === conversations.length;

  return (
    <div>
      {/* Select / Cancel + select-all toggle */}
      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
          className="inline-flex min-h-11 items-center rounded-pill border border-hairline bg-surface px-3.5 text-[13px] font-semibold text-ink-soft active:opacity-80"
        >
          {selectMode ? "Cancel" : "Select"}
        </button>
        {selectMode && (
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex min-h-11 items-center px-2 text-[13px] font-semibold text-accent-ink active:opacity-70"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-2.5">
        {conversations.map((c) => {
          const origin = c.origin ? ORIGIN_LABELS[c.origin] : null;
          const status = STATUS_LABELS[c.status] ?? STATUS_LABELS.open;
          const isSelected = selected.has(c.threadId);

          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
                  {c.personName}
                </p>
                <span
                  className={`shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${status.className}`}
                >
                  {status.label}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {origin && (
                  <span
                    className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] ${origin.className}`}
                  >
                    {origin.label}
                  </span>
                )}
                {c.hasReview && (
                  <span className="rounded-pill bg-warm-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] text-warm">
                    Reviewed
                  </span>
                )}
              </div>

              {c.topic && (
                <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-[1.45] text-ink">
                  {c.topic}
                </p>
              )}
              {c.aiHeadline && (
                <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-[1.45] text-ink-soft">
                  <span className="font-semibold text-accent-ink">Coach: </span>
                  {c.aiHeadline}
                </p>
              )}
            </>
          );

          if (!selectMode) {
            return (
              <li key={c.threadId}>
                <Link
                  href={`/conversations/${c.threadId}`}
                  className="block rounded-card border border-hairline bg-surface p-4 transition active:scale-[0.99]"
                >
                  {body}
                </Link>
              </li>
            );
          }

          return (
            <li key={c.threadId}>
              <button
                type="button"
                onClick={() => toggle(c.threadId)}
                aria-pressed={isSelected}
                className={`flex w-full items-start gap-3 rounded-card border bg-surface p-4 text-left transition active:scale-[0.99] ${
                  isSelected ? "border-accent" : "border-hairline"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border ${
                    isSelected
                      ? "border-accent bg-accent text-white"
                      : "border-hairline bg-surface-tint"
                  }`}
                  aria-hidden
                >
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">{body}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Bulk action bar — fixed above the tab bar while selecting. */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-surface/95 px-5 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-semibold text-ink">
              {count} selected
            </span>
            <div className="flex-1" />
            <select
              value=""
              disabled={count === 0 || busy}
              onChange={(e) => applyStatus(e.target.value)}
              className="rounded-input border border-hairline bg-surface px-2.5 py-2 text-base text-ink focus:border-accent focus:outline-none disabled:opacity-50"
            >
              <option value="" disabled>
                Set status…
              </option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={count === 0 || busy}
              className="rounded-pill bg-danger px-4 py-2.5 text-[13px] font-bold text-white active:opacity-90 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
          {error && (
            <p className="mt-2 text-[12px] font-medium text-danger">{error}</p>
          )}
        </div>
      )}

      {/* Bulk-delete confirmation */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
          onClick={() => !busy && setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-hairline bg-surface p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-[22px] font-medium leading-[1.15] text-ink">
              Delete {count} conversation{count === 1 ? "" : "s"}?
            </h3>
            <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
              This removes each selected conversation — every Prepare, Pulse
              Check, and Review in them — and they won&apos;t be used in future
              weekly reflections. This can&apos;t be undone.
            </p>
            {error && (
              <p className="mt-3 text-[13px] font-medium text-danger">{error}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={busy}
                className="h-12 flex-1 rounded-pill bg-surface-tint text-[14px] font-semibold text-ink active:opacity-80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={busy}
                className="h-12 flex-1 rounded-pill bg-danger text-[14px] font-bold text-white active:opacity-90 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
