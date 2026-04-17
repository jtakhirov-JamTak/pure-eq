"use server";

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
  const rl = await rateLimit(`thread-status:${user.id}`, { limit: 20, windowMs: 60_000 });
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
