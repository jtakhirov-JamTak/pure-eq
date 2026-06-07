// ============================================================
// Open loops (return-loop helper) — shared by Home hub + Conversations tab
// ============================================================
// An "open loop" is a conversation the user prepared for (or pulse-checked)
// but hasn't reviewed yet: an OPEN thread tied to a person, with a completed
// Prepare/Pulse entry and NO completed Review entry. Tapping one resumes into
// Review with the person pre-selected (the Prepare→Review calibration link
// forms server-side off the person).
//
// Read-only; every query inspects .error per the server-component read lesson.
import { createClient } from "@/lib/supabase/server";
import { captureServerRead } from "@/lib/read-capture";

export type OpenLoop = {
  threadId: string;
  personId: string | null;
  personName: string;
  title: string | null;
  lastActivityAt: string;
};

export async function getOpenLoops(
  userId: string,
  limit = 3,
): Promise<OpenLoop[]> {
  const supabase = await createClient();
  const threadsRes = await supabase
    .from("conversation_threads")
    .select("thread_id, person_id, title, last_activity_at")
    .eq("user_id", userId)
    .eq("status", "open")
    .not("person_id", "is", null)
    .order("last_activity_at", { ascending: false })
    .limit(50);
  if (threadsRes.error) {
    captureServerRead(
      "open_loops",
      "conversation_threads",
      new Error("open_loops_threads_read_failed"),
    );
    return [];
  }
  const openThreads = threadsRes.data ?? [];
  const threadIds = openThreads.map((t) => t.thread_id);
  if (threadIds.length === 0) return [];

  const [recsRes, personsRes] = await Promise.all([
    supabase
      .from("raw_records")
      .select("thread_id, record_type")
      .eq("user_id", userId)
      .in("thread_id", threadIds)
      .in("record_type", ["prepare", "pulse_check", "review"])
      .eq("is_complete", true)
      .is("deleted_at", null),
    supabase
      .from("persons")
      .select("person_id, display_name")
      .eq("user_id", userId)
      .limit(500),
  ]);
  if (recsRes.error) {
    captureServerRead(
      "open_loops",
      "raw_records",
      new Error("open_loops_records_read_failed"),
    );
    return [];
  }
  if (personsRes.error) {
    captureServerRead(
      "open_loops",
      "persons",
      new Error("open_loops_persons_read_failed"),
    );
  }

  // A loop is open when the thread has a Prepare or Pulse Check but no Review.
  const hasOpener = new Set<string>();
  const hasReview = new Set<string>();
  for (const r of recsRes.data ?? []) {
    if (!r.thread_id) continue;
    if (r.record_type === "review") hasReview.add(r.thread_id);
    else hasOpener.add(r.thread_id); // prepare | pulse_check
  }
  const nameById = new Map(
    (personsRes.data ?? []).map((p) => [p.person_id, p.display_name]),
  );

  const loops: OpenLoop[] = [];
  for (const t of openThreads) {
    if (!t.person_id) continue;
    if (hasOpener.has(t.thread_id) && !hasReview.has(t.thread_id)) {
      loops.push({
        threadId: t.thread_id,
        personId: t.person_id,
        personName: nameById.get(t.person_id) ?? "someone",
        title: t.title ?? null,
        lastActivityAt: t.last_activity_at,
      });
      if (loops.length >= limit) break;
    }
  }
  return loops;
}
