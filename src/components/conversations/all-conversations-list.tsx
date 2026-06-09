"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  // Portal target: the action bar / modal must escape <main>'s z-10 stacking
  // context, or the app-shell tab bar (rendered outside main) covers them.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    setError(null);
    setShowDeleteConfirm(false);
    // Clear busy on every exit, incl. the success path: confirmDelete/applyStatus
    // call exitSelect() without resetting busy, so without this a completed bulk
    // action would leave the action buttons stuck disabled on the next select.
    setBusy(false);
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

      {/* Bulk action bar — portaled to body so it sits above the tab bar
          (which lives outside <main>'s z-10 stacking context). */}
      {selectMode &&
        mounted &&
        createPortal(
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
            <p role="alert" className="mt-2 text-[12px] font-medium text-danger">
              {error}
            </p>
          )}
          </div>,
          document.body,
        )}

      {/* Bulk-delete confirmation — shared accessible dialog (role/dialog,
          focus trap, Escape, focus restore); portals itself to body. */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title={`Delete ${count} conversation${count === 1 ? "" : "s"}?`}
        description="This removes each selected conversation — every Prepare, Pulse Check, and Review in them — and they won't be used in future weekly reflections. This can't be undone."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={busy}
        error={error}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
