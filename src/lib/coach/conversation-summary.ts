// ============================================================
// Conversation summaries — the "See all conversations" data layer
// ============================================================
// A conversation == a conversation_thread (created by Prepare or Pulse Check
// about a person; Review attaches to it). For each thread we surface: who,
// the main topic, the origin (prepared vs. "something felt off"), whether it's
// been reviewed, and a one-line snippet of the MAIN AI OUTPUT.
//
// The one-line AI headline is DENORMALIZED into each derived table's
// `ai_headline` column, stamped at generation time by run-module via
// extractHeadline() (defined here = single source of truth). The reads below
// select that short string instead of the full AI jsonb blob (the old path
// fetched 100s of KB across up to 100 threads to read one line each). A null
// ai_headline (refusal with no message, or a pre-backfill row) just omits the
// AI line. extractHeadline() stays exported as the writer's extractor.
//
// Threads whose entries are all soft-deleted (a deleted conversation) drop out:
// we only fetch is_complete + deleted_at-null entries, and skip any thread with
// zero surviving entries. NB: the three derived tables queried below must stay
// in lockstep with THREADED_RECORD_TYPES (src/types) — that constant is the
// single source for "which entry types make a conversation exist"; if a new
// module ever threads, add its table to these reads.
import { createClient } from "@/lib/supabase/server";
import { captureServerRead } from "@/lib/read-capture";

export type ConversationOrigin = "prepare" | "pulse_check";

export type ConversationSummary = {
  threadId: string;
  personId: string | null;
  personName: string;
  topic: string | null;
  origin: ConversationOrigin | null;
  status: string;
  hasReview: boolean;
  aiHeadline: string | null;
  lastActivityAt: string;
};

// The single "headline" field of each module's AI output, by record type.
// Refusal rows (mode === "refusal") surface message_to_user instead.
export function extractHeadline(
  recordType: string,
  aiJson: unknown,
): string | null {
  if (!aiJson || typeof aiJson !== "object") return null;
  const j = aiJson as Record<string, unknown>;
  if (j.mode === "refusal") {
    return typeof j.message_to_user === "string" && j.message_to_user.trim()
      ? j.message_to_user.trim()
      : null;
  }
  let field: string | null = null;
  if (recordType === "prepare") field = "pressure_check";
  else if (recordType === "review") field = "pattern_data";
  else if (recordType === "pulse_check") field = "signal_vs_noise";
  if (!field) return null;
  const v = j[field];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type ThreadEntry = {
  recordType: ConversationOrigin | "review";
  createdAt: string;
  topic: string | null;
  headline: string | null;
};

export type ConversationSummaryResult = {
  summaries: ConversationSummary[];
  truncated: boolean;
};

export async function getConversationSummaries(
  userId: string,
): Promise<ConversationSummaryResult> {
  const supabase = await createClient();

  // Cap at 100 conversations (v0). RPC-upgrade path if a user ever exceeds it:
  // paginate by last_activity_at. We fetch 101 so we can tell the caller when
  // the list was truncated (and the page shows a "newest 100" notice).
  const [threadsRes, personsRes] = await Promise.all([
    supabase
      .from("conversation_threads")
      .select("thread_id, title, status, person_id, last_activity_at")
      .eq("user_id", userId)
      .order("last_activity_at", { ascending: false })
      .limit(101),
    supabase
      .from("persons")
      .select("person_id, display_name")
      .eq("user_id", userId)
      .limit(500),
  ]);

  if (threadsRes.error) {
    captureServerRead(
      "conversations",
      "conversation_threads",
      new Error("conversation_threads_read_failed"),
    );
    return { summaries: [], truncated: false };
  }
  if (personsRes.error) {
    captureServerRead(
      "conversations",
      "persons",
      new Error("persons_read_failed"),
    );
  }

  // We asked for 101; if we got more than 100 the list is truncated. Trim to
  // the 100 newest before building summaries.
  const allThreads = threadsRes.data ?? [];
  const truncated = allThreads.length > 100;
  const threads = truncated ? allThreads.slice(0, 100) : allThreads;
  const threadIds = threads.map((t) => t.thread_id);
  if (threadIds.length === 0) return { summaries: [], truncated: false };

  const nameById = new Map(
    (personsRes.data ?? []).map((p) => [p.person_id, p.display_name]),
  );

  // Pull the three threaded module tables in bulk (no N+1). Each row carries its
  // topic column + the denormalized ai_headline string (stamped at generation
  // time by run-module via extractHeadline) — NOT the full AI jsonb blob, which
  // would be 100s of KB across up to 100 threads just to read one line each.
  const [prepRes, reviewRes, pulseRes] = await Promise.all([
    supabase
      .from("prepare_entries")
      .select("thread_id, situation_text, ai_headline, created_at")
      .eq("user_id", userId)
      .in("thread_id", threadIds)
      .eq("is_complete", true)
      .is("deleted_at", null),
    supabase
      .from("review_entries")
      .select("thread_id, what_happened, ai_headline, created_at")
      .eq("user_id", userId)
      .in("thread_id", threadIds)
      .eq("is_complete", true)
      .is("deleted_at", null),
    supabase
      .from("pulse_check_entries")
      .select("thread_id, what_feels_off, ai_headline, created_at")
      .eq("user_id", userId)
      .in("thread_id", threadIds)
      .eq("is_complete", true)
      .is("deleted_at", null),
  ]);

  for (const [res, kind] of [
    [prepRes, "prepare_entries"],
    [reviewRes, "review_entries"],
    [pulseRes, "pulse_check_entries"],
  ] as const) {
    if (res.error) {
      captureServerRead(
        "conversations",
        kind,
        new Error(`${kind}_read_failed`),
      );
    }
  }

  // Group entries by thread.
  const byThread = new Map<string, ThreadEntry[]>();
  const push = (e: ThreadEntry & { threadId: string | null }) => {
    if (!e.threadId) return;
    const list = byThread.get(e.threadId) ?? [];
    list.push(e);
    byThread.set(e.threadId, list);
  };
  for (const r of prepRes.data ?? []) {
    push({
      threadId: r.thread_id,
      recordType: "prepare",
      createdAt: r.created_at,
      topic: r.situation_text ?? null,
      headline: r.ai_headline,
    });
  }
  for (const r of reviewRes.data ?? []) {
    push({
      threadId: r.thread_id,
      recordType: "review",
      createdAt: r.created_at,
      topic: r.what_happened ?? null,
      headline: r.ai_headline,
    });
  }
  for (const r of pulseRes.data ?? []) {
    push({
      threadId: r.thread_id,
      recordType: "pulse_check",
      createdAt: r.created_at,
      topic: r.what_feels_off ?? null,
      headline: r.ai_headline,
    });
  }

  const summaries: ConversationSummary[] = [];
  for (const t of threads) {
    const entries = byThread.get(t.thread_id);
    if (!entries || entries.length === 0) continue; // deleted/empty thread

    const byTime = [...entries].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const first = byTime[0];
    const last = byTime[byTime.length - 1];
    const origin: ConversationOrigin | null =
      first.recordType === "review" ? null : first.recordType;
    const hasReview = entries.some((e) => e.recordType === "review");

    summaries.push({
      threadId: t.thread_id,
      personId: t.person_id,
      personName: t.person_id
        ? (nameById.get(t.person_id) ?? "Someone")
        : "General",
      topic: t.title ?? first.topic,
      origin,
      status: t.status,
      hasReview,
      aiHeadline: last.headline,
      lastActivityAt: t.last_activity_at,
    });
  }

  return { summaries, truncated };
}

// ============================================================
// Thread timeline — the per-conversation detail view
// ============================================================
// One entry per completed module run in a single thread, each carrying BOTH the
// user's input summary and the coach AI headline (same extractor as the list).
// Sourced from the derived tables (not raw_records) because that's where the AI
// output lives. Oldest → newest. Every query inspects .error.
export type ThreadTimelineEntry = {
  recordType: ConversationOrigin | "review";
  createdAt: string;
  inputSummary: string | null;
  aiHeadline: string | null;
};

function clip(s: string | null | undefined, max = 240): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export async function getThreadEntries(
  userId: string,
  threadId: string,
): Promise<ThreadTimelineEntry[]> {
  const supabase = await createClient();

  const [prepRes, reviewRes, pulseRes] = await Promise.all([
    supabase
      .from("prepare_entries")
      .select("situation_text, ai_headline, created_at")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .eq("is_complete", true)
      .is("deleted_at", null),
    supabase
      .from("review_entries")
      .select("what_happened, ai_headline, created_at")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .eq("is_complete", true)
      .is("deleted_at", null),
    supabase
      .from("pulse_check_entries")
      .select("what_feels_off, ai_headline, created_at")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .eq("is_complete", true)
      .is("deleted_at", null),
  ]);

  for (const [res, kind] of [
    [prepRes, "prepare_entries"],
    [reviewRes, "review_entries"],
    [pulseRes, "pulse_check_entries"],
  ] as const) {
    if (res.error) {
      captureServerRead(
        "thread_entries",
        kind,
        new Error(`${kind}_read_failed`),
      );
    }
  }

  const entries: ThreadTimelineEntry[] = [];
  for (const r of prepRes.data ?? []) {
    entries.push({
      recordType: "prepare",
      createdAt: r.created_at,
      inputSummary: clip(r.situation_text),
      aiHeadline: r.ai_headline,
    });
  }
  for (const r of reviewRes.data ?? []) {
    entries.push({
      recordType: "review",
      createdAt: r.created_at,
      inputSummary: clip(r.what_happened),
      aiHeadline: r.ai_headline,
    });
  }
  for (const r of pulseRes.data ?? []) {
    entries.push({
      recordType: "pulse_check",
      createdAt: r.created_at,
      inputSummary: clip(r.what_feels_off),
      aiHeadline: r.ai_headline,
    });
  }

  entries.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return entries;
}
