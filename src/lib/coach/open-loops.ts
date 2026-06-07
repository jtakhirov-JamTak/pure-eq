// ============================================================
// Conversations-tab overview — open loops + open conversations, one read pass
// ============================================================
// Both sections of the Conversations tab derive from the same open/stabilizing
// threads, so we read threads + their entries + persons ONCE and split:
//   - openLoops:   a thread you prepared/pulse-checked but haven't reviewed
//                  (status "open", person set) — tapping resumes into Review.
//   - openThreads: any open|stabilizing thread with a surviving entry — tapping
//                  opens the conversation detail.
//
// Read-only; every query inspects .error per the server-component read lesson.
import { createClient } from "@/lib/supabase/server";
import { captureServerRead } from "@/lib/read-capture";

export type OpenLoop = {
  threadId: string;
  personId: string | null;
  personName: string;
  lastActivityAt: string;
};

export type OpenThread = {
  threadId: string;
  personName: string;
  status: string;
};

export type ConversationsOverview = {
  openLoops: OpenLoop[];
  openThreads: OpenThread[];
};

export async function getConversationsOverview(
  userId: string,
  limit = 3,
): Promise<ConversationsOverview> {
  const empty: ConversationsOverview = { openLoops: [], openThreads: [] };
  const supabase = await createClient();

  const threadsRes = await supabase
    .from("conversation_threads")
    .select("thread_id, status, person_id, last_activity_at")
    .eq("user_id", userId)
    .in("status", ["open", "stabilizing"])
    .order("last_activity_at", { ascending: false })
    .limit(50);
  if (threadsRes.error) {
    captureServerRead(
      "conversations_overview",
      "conversation_threads",
      new Error("conversations_overview_threads_read_failed"),
    );
    return empty;
  }
  const threads = threadsRes.data ?? [];
  const threadIds = threads.map((t) => t.thread_id);
  if (threadIds.length === 0) return empty;

  const [recsRes, personsRes] = await Promise.all([
    // One bounded read serves both derivations: record_type drives loop
    // detection, and any surviving row marks the thread as non-deleted. Threads
    // only ever carry prepare/pulse_check/review entries (BYS is stateless,
    // repair is legacy/null), so this filter never drops a real survivor.
    // .limit(1000) makes the PostgREST cap explicit: with >1000 entries across
    // the 50 newest open threads an older thread could be missed from these
    // browse lists — acceptable for a top-3 surface, not a completeness one.
    supabase
      .from("raw_records")
      .select("thread_id, record_type")
      .eq("user_id", userId)
      .in("thread_id", threadIds)
      .in("record_type", ["prepare", "pulse_check", "review"])
      .eq("is_complete", true)
      .is("deleted_at", null)
      .limit(1000),
    supabase
      .from("persons")
      .select("person_id, display_name")
      .eq("user_id", userId)
      .limit(500),
  ]);
  if (recsRes.error) {
    captureServerRead(
      "conversations_overview",
      "raw_records",
      new Error("conversations_overview_records_read_failed"),
    );
    return empty;
  }
  if (personsRes.error) {
    captureServerRead(
      "conversations_overview",
      "persons",
      new Error("conversations_overview_persons_read_failed"),
    );
  }

  const hasOpener = new Set<string>();
  const hasReview = new Set<string>();
  const surviving = new Set<string>();
  for (const r of recsRes.data ?? []) {
    if (!r.thread_id) continue;
    surviving.add(r.thread_id);
    if (r.record_type === "review") hasReview.add(r.thread_id);
    else hasOpener.add(r.thread_id); // prepare | pulse_check
  }
  const nameById = new Map(
    (personsRes.data ?? []).map((p) => [p.person_id, p.display_name]),
  );

  const openLoops: OpenLoop[] = [];
  const openThreads: OpenThread[] = [];
  for (const t of threads) {
    // Open conversation (browse): open|stabilizing with a surviving entry.
    if (openThreads.length < limit && surviving.has(t.thread_id)) {
      openThreads.push({
        threadId: t.thread_id,
        personName: t.person_id
          ? (nameById.get(t.person_id) ?? "Someone")
          : "General",
        status: t.status,
      });
    }
    // Open loop (resume → Review): status "open", person set, opener, no review.
    if (
      openLoops.length < limit &&
      t.status === "open" &&
      t.person_id &&
      hasOpener.has(t.thread_id) &&
      !hasReview.has(t.thread_id)
    ) {
      openLoops.push({
        threadId: t.thread_id,
        personId: t.person_id,
        personName: nameById.get(t.person_id) ?? "someone",
        lastActivityAt: t.last_activity_at,
      });
    }
  }
  return { openLoops, openThreads };
}
