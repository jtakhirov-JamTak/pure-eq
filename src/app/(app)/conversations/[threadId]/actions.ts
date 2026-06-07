"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import type { ThreadStatus } from "@/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES: ThreadStatus[] = [
  "open",
  "stabilizing",
  "resolved",
  "paused",
  "worsened",
  "ended",
];

const TERMINAL_STATUSES = new Set(["resolved", "ended"]);

export async function updateThreadStatus(
  threadId: string,
  newStatus: string,
): Promise<{ success: boolean; error?: string }> {
  // Validate inputs before touching DB.
  if (!UUID_RE.test(threadId)) {
    return { success: false, error: "Invalid thread ID" };
  }
  if (!VALID_STATUSES.includes(newStatus as ThreadStatus)) {
    return { success: false, error: "Invalid status" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Rate limit — same pattern as other write paths.
  const rl = await rateLimit(`thread-status:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return { success: false, error: "Too many requests" };
  }

  // Set or clear resolved_at based on terminal vs non-terminal status.
  const resolvedAt = TERMINAL_STATUSES.has(newStatus)
    ? new Date().toISOString()
    : null;

  const { error } = await supabase
    .from("conversation_threads")
    .update({
      status: newStatus,
      resolved_at: resolvedAt,
    })
    .eq("thread_id", threadId)
    .eq("user_id", user.id);

  if (error) {
    console.error("updateThreadStatus: failed", error.code);
    return { success: false, error: "Could not update status" };
  }

  return { success: true };
}

// Delete a whole conversation: soft-delete its raw_records and the three
// threaded derived tables (prepare/review/pulse) scoped to the thread. The
// thread row stays (no deleted_at column on conversation_threads) but drops out
// of every conversation view, because both the See-all summary builder and the
// open-loop helper skip threads with zero surviving (non-deleted, complete)
// entries. Inspect .error on every write — PostgREST returns { error } rather
// than throwing, and a partial success would leave orphaned visible rows.
export async function deleteConversation(
  threadId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(threadId)) {
    return { success: false, error: "Invalid thread ID" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const rl = await rateLimit(`conversation-delete:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return { success: false, error: "Too many requests" };
  }

  // Verify the thread belongs to this user before deleting anything.
  const { data: thread, error: threadErr } = await supabase
    .from("conversation_threads")
    .select("thread_id")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (threadErr) {
    console.error("deleteConversation: thread lookup failed", threadErr.code);
    return { success: false, error: "Could not delete" };
  }
  if (!thread) {
    return { success: false, error: "Conversation not found" };
  }

  const now = new Date().toISOString();

  const rawRes = await supabase
    .from("raw_records")
    .update({ deleted_at: now })
    .eq("user_id", user.id)
    .eq("thread_id", threadId)
    .is("deleted_at", null);
  if (rawRes.error) {
    console.error("deleteConversation: raw update failed", rawRes.error.code);
    return { success: false, error: "Could not delete" };
  }

  const derivedResults = await Promise.all([
    supabase
      .from("prepare_entries")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .eq("thread_id", threadId)
      .is("deleted_at", null),
    supabase
      .from("review_entries")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .eq("thread_id", threadId)
      .is("deleted_at", null),
    supabase
      .from("pulse_check_entries")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .eq("thread_id", threadId)
      .is("deleted_at", null),
  ]);
  const derivedErrors = derivedResults.filter((r) => r.error);
  if (derivedErrors.length > 0) {
    for (const r of derivedErrors) {
      console.error("deleteConversation: derived update failed", r.error?.code);
    }
    return {
      success: false,
      error: "Some of this conversation could not be deleted. Try again.",
    };
  }

  revalidatePath("/conversations");
  revalidatePath("/conversations/all");
  return { success: true };
}
