// ============================================================
// Conversation stats — the Conversations-tab dashboard data layer
// ============================================================
// At-a-glance numbers for the top of the Convos tab: how many conversations
// you've worked, who they're with (by relationship group + top people), and
// how many are still open. A "conversation" here matches the All-conversations
// list exactly: a conversation_thread with at least one surviving
// (is_complete, not soft-deleted) entry — bulk delete soft-deletes entries but
// leaves the thread row, so counting bare threads would resurrect deleted
// conversations.
//
// Read-only; every query inspects .error per the server-component read lesson.
import { createClient } from "@/lib/supabase/server";
import { captureServerRead } from "@/lib/read-capture";
import type { RelationshipDomain } from "@/types";

export type RelationshipGroup =
  | "work"
  | "family"
  | "partner"
  | "friend"
  | "other";

export const GROUP_LABELS: Record<RelationshipGroup, string> = {
  work: "Work",
  family: "Family",
  partner: "Partner",
  friend: "Friends",
  other: "Other",
};

// The app tracks 8 relationship domains; the dashboard rolls the four
// work-flavored ones into a single "Work" row so the list stays scannable.
const DOMAIN_TO_GROUP: Record<RelationshipDomain, RelationshipGroup> = {
  partner: "partner",
  friend: "friend",
  family: "family",
  manager: "work",
  direct_report: "work",
  coworker: "work",
  client: "work",
  other: "other",
};

export type ConversationStats = {
  total: number;
  open: number; // open + stabilizing
  resolved: number; // resolved + ended
  byGroup: { group: RelationshipGroup; count: number }[]; // count > 0, desc
  // top 3 by conversation count. personId carried for React keys — display
  // names are NOT unique (dedup is per name+domain), so keying on name
  // collides for "Alex (friend)" + "Alex (coworker)".
  topPeople: { personId: string; name: string; count: number }[];
  hasAny: boolean;
};

const EMPTY: ConversationStats = {
  total: 0,
  open: 0,
  resolved: 0,
  byGroup: [],
  topPeople: [],
  hasAny: false,
};

export async function getConversationStats(
  userId: string,
): Promise<ConversationStats> {
  const supabase = await createClient();

  // Explicit caps (RPC-upgrade path: move the counting into a GROUP BY view if
  // a user ever exceeds them). At the 1000-row PostgREST cap these counts can
  // undercount — acceptable for an at-a-glance dashboard, not an export.
  const [threadsRes, recsRes, personsRes] = await Promise.all([
    supabase
      .from("conversation_threads")
      .select("thread_id, status, person_id")
      .eq("user_id", userId)
      .limit(1000),
    // Survival check mirrors open-loops.ts: threads only ever carry
    // prepare/pulse_check/review entries.
    supabase
      .from("raw_records")
      .select("thread_id")
      .eq("user_id", userId)
      .not("thread_id", "is", null)
      .in("record_type", ["prepare", "pulse_check", "review"])
      .eq("is_complete", true)
      .is("deleted_at", null)
      .limit(1000),
    supabase
      .from("persons")
      .select("person_id, display_name, relationship_domain")
      .eq("user_id", userId)
      .limit(500),
  ]);

  if (threadsRes.error) {
    captureServerRead(
      "conversation_stats",
      "conversation_threads",
      new Error("conversation_stats_threads_read_failed"),
    );
    return EMPTY;
  }
  if (recsRes.error) {
    captureServerRead(
      "conversation_stats",
      "raw_records",
      new Error("conversation_stats_records_read_failed"),
    );
    return EMPTY;
  }
  if (personsRes.error) {
    captureServerRead(
      "conversation_stats",
      "persons",
      new Error("conversation_stats_persons_read_failed"),
    );
  }

  const surviving = new Set<string>();
  for (const r of recsRes.data ?? []) {
    if (r.thread_id) surviving.add(r.thread_id);
  }

  const personById = new Map(
    (personsRes.data ?? []).map((p) => [
      p.person_id,
      { name: p.display_name, domain: p.relationship_domain },
    ]),
  );

  let total = 0;
  let open = 0;
  let resolved = 0;
  const groupCounts = new Map<RelationshipGroup, number>();
  const personCounts = new Map<string, number>();

  for (const t of threadsRes.data ?? []) {
    if (!surviving.has(t.thread_id)) continue; // deleted/empty thread
    total += 1;
    if (t.status === "open" || t.status === "stabilizing") open += 1;
    else if (t.status === "resolved" || t.status === "ended") resolved += 1;

    const person = t.person_id ? personById.get(t.person_id) : undefined;
    const group: RelationshipGroup = person
      ? (DOMAIN_TO_GROUP[person.domain as RelationshipDomain] ?? "other")
      : "other";
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    if (t.person_id && person) {
      personCounts.set(t.person_id, (personCounts.get(t.person_id) ?? 0) + 1);
    }
  }

  const byGroup = [...groupCounts.entries()]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count);

  const topPeople = [...personCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([personId, count]) => ({
      personId,
      name: personById.get(personId)?.name ?? "Someone",
      count,
    }));

  return { total, open, resolved, byGroup, topPeople, hasAny: total > 0 };
}
