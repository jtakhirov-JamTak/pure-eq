"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import type { ThreadStatus } from "@/types";

// Bulk variants of the per-conversation actions in ../[threadId]/actions.ts,
// for the multi-select toolbar on the "All conversations" list. Each operates
// on an array of thread ids via a single `.in(...)` UPDATE — efficient, and the
// `.eq("user_id", ...)` filter (plus RLS) keeps it scoped to the caller's own
// threads. Every write inspects .error: PostgREST returns { error } rather than
// throwing, and a partial success would leave half a selection behind.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES: ThreadStatus[] = ["open", "in_progress", "completed"];

const TERMINAL_STATUSES = new Set(["completed"]);

// Cap selection size so one request can't fan out unbounded writes.
const MAX_BULK = 100;

function cleanIds(threadIds: unknown): string[] | null {
  if (!Array.isArray(threadIds)) return null;
  const ids = Array.from(new Set(threadIds)).filter(
    (id): id is string => typeof id === "string" && UUID_RE.test(id),
  );
  if (ids.length === 0 || ids.length > MAX_BULK) return null;
  return ids;
}

export async function bulkUpdateThreadStatus(
  threadIds: string[],
  newStatus: string,
): Promise<{ success: boolean; error?: string }> {
  const ids = cleanIds(threadIds);
  if (!ids) return { success: false, error: "Invalid selection" };
  if (!VALID_STATUSES.includes(newStatus as ThreadStatus)) {
    return { success: false, error: "Invalid status" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const rl = await rateLimit(`thread-status:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return { success: false, error: "Too many requests" };

  const resolvedAt = TERMINAL_STATUSES.has(newStatus)
    ? new Date().toISOString()
    : null;

  const { error } = await supabase
    .from("conversation_threads")
    .update({ status: newStatus, resolved_at: resolvedAt })
    .in("thread_id", ids)
    .eq("user_id", user.id);

  if (error) {
    console.error("bulkUpdateThreadStatus: failed", error.code);
    return { success: false, error: "Could not update status" };
  }

  revalidatePath("/conversations");
  revalidatePath("/conversations/all");
  return { success: true };
}

export async function bulkDeleteConversations(
  threadIds: string[],
): Promise<{ success: boolean; error?: string }> {
  const ids = cleanIds(threadIds);
  if (!ids) return { success: false, error: "Invalid selection" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const rl = await rateLimit(`conversation-delete:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return { success: false, error: "Too many requests" };

  const now = new Date().toISOString();

  const rawRes = await supabase
    .from("raw_records")
    .update({ deleted_at: now })
    .eq("user_id", user.id)
    .in("thread_id", ids)
    .is("deleted_at", null);
  if (rawRes.error) {
    console.error("bulkDeleteConversations: raw update failed", rawRes.error.code);
    return { success: false, error: "Could not delete" };
  }

  // Soft-delete every derived table that carries a thread_id FK. Today only
  // prepare/review/pulse actually thread, so the other two match zero rows —
  // included defensively so this stays correct the moment any of them threads.
  const derivedResults = await Promise.all([
    supabase
      .from("prepare_entries")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .in("thread_id", ids)
      .is("deleted_at", null),
    supabase
      .from("review_entries")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .in("thread_id", ids)
      .is("deleted_at", null),
    supabase
      .from("pulse_check_entries")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .in("thread_id", ids)
      .is("deleted_at", null),
    supabase
      .from("before_you_send_entries")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .in("thread_id", ids)
      .is("deleted_at", null),
    supabase
      .from("repair_entries")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .in("thread_id", ids)
      .is("deleted_at", null),
  ]);
  const derivedErrors = derivedResults.filter((r) => r.error);
  if (derivedErrors.length > 0) {
    for (const r of derivedErrors) {
      console.error(
        "bulkDeleteConversations: derived update failed",
        r.error?.code,
      );
    }
    return {
      success: false,
      error: "Some conversations could not be deleted. Try again.",
    };
  }

  revalidatePath("/conversations");
  revalidatePath("/conversations/all");
  return { success: true };
}
