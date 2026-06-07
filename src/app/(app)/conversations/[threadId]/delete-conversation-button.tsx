"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteConversation } from "./actions";

// Per-conversation delete (lives only in the detail view). Soft-deletes the
// whole thread's entries via the server action, then routes back to the full
// list. Confirmation modal so a single tap can't wipe a conversation.
export function DeleteConversationButton({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteConversation(threadId);
      if (!result.success) {
        throw new Error(result.error ?? "Delete failed");
      }
      router.push("/conversations/all");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-hairline bg-surface px-4 text-[13px] font-semibold text-ink-soft active:opacity-80"
      >
        <Trash2 className="h-4 w-4" />
        Delete conversation
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
          onClick={() => !deleting && setShowConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-hairline bg-surface p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-[22px] font-medium leading-[1.15] text-ink">
              Delete this conversation?
            </h3>
            <p className="mt-2 text-[14px] font-medium leading-[1.5] text-ink-soft">
              This removes the whole conversation — every Prepare, Pulse Check,
              and Review in it — and it won&apos;t be used in future weekly
              reflections. This can&apos;t be undone.
            </p>
            {error && (
              <p className="mt-3 text-[13px] font-medium text-danger">{error}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="h-12 flex-1 rounded-pill bg-surface-tint text-[14px] font-semibold text-ink active:opacity-80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="h-12 flex-1 rounded-pill bg-danger text-[14px] font-bold text-white active:opacity-90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
