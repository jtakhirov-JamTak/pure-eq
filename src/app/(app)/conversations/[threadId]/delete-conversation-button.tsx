"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

      <ConfirmDialog
        open={showConfirm}
        title="Delete this conversation?"
        description="This removes the whole conversation — every Prepare, Pulse Check, and Review in it — and it won't be used in future weekly reflections. This can't be undone."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={deleting}
        error={error}
        onConfirm={confirmDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
