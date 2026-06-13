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
import { THREADED_RECORD_TYPES, type RelationshipDomain } from "@/types";

export type RelationshipGroup =
  | "work"
  | "family"
  | "romantic"
  | "friend"
  | "other";

export const GROUP_LABELS: Record<RelationshipGroup, string> = {
  work: "Work",
  family: "Family",
  romantic: "Romantic",
  friend: "Friends",
  other: "Other",
};

// Since migration 0052 the 5 relationship domains map 1:1 onto the dashboard
// groups (work already absorbed the old manager/coworker/client/direct_report
// at the domain level). The indirection stays so a future domain split can
// re-roll without touching every reader.
const DOMAIN_TO_GROUP: Record<RelationshipDomain, RelationshipGroup> = {
  romantic: "romantic",
  friend: "friend",
  family: "family",
  work: "work",
  other: "other",
};

// One row in the Convos "People" section — the entry point into the
// per-person history page (/people/[personId]).
export type PersonOverviewRow = {
  personId: string;
  name: string;
  conversations: number;
  open: number; // open + in_progress (anything not completed)
  lastActivityAt: string | null;
};

export type ConversationStats = {
  // The three states partition cleanly: total = open + inProgress + completed.
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  byGroup: { group: RelationshipGroup; count: number }[]; // count > 0, desc
  // top 3 by conversation count. personId carried for React keys — display
  // names are NOT unique (dedup is per name+domain), so keying on name
  // collides for "Alex (friend)" + "Alex (coworker)".
  topPeople: { personId: string; name: string; count: number }[];
  // Top 3 people by OPEN conversation count (founder direction 2026-06-12:
  // "People should only show the top three with the most conversations that
  // are open"). Only people with >= 1 non-completed conversation appear; the
  // full set of people is reachable through See-all-conversations. Persons
  // with only tools/BYS entries and no conversation don't appear (v0).
  people: PersonOverviewRow[];
  hasAny: boolean;
};

const EMPTY: ConversationStats = {
  total: 0,
  open: 0,
  inProgress: 0,
  completed: 0,
  byGroup: [],
  topPeople: [],
  people: [],
  hasAny: false,
};

const MAX_PEOPLE_ROWS = 3;

export async function getConversationStats(
  userId: string,
): Promise<ConversationStats> {
  const supabase = await createClient();

  // Explicit caps (RPC-upgrade path: move the counting into a GROUP BY view if
  // a user ever exceeds them). At the 1000-row PostgREST cap these counts can
  // undercount — acceptable for an at-a-glance dashboard, not an export.
  const [threadsRes, recsRes, personsRes] = await Promise.all([
    // .order() makes each cap deterministic: "the newest 1000", not an
    // arbitrary 1000 chosen by the planner once a user exceeds the cap.
    supabase
      .from("conversation_threads")
      .select("thread_id, status, person_id, last_activity_at")
      .eq("user_id", userId)
      .order("last_activity_at", { ascending: false })
      .limit(1000),
    // Survival check mirrors open-loops.ts via the shared constant.
    supabase
      .from("raw_records")
      .select("thread_id")
      .eq("user_id", userId)
      .not("thread_id", "is", null)
      .in("record_type", [...THREADED_RECORD_TYPES])
      .eq("is_complete", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
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
    // Without persons, byGroup would confidently misattribute EVERY
    // conversation to "Other" and People/topPeople would vanish — wrong data,
    // not degraded data. Return the empty state like the other two arms.
    captureServerRead(
      "conversation_stats",
      "persons",
      new Error("conversation_stats_persons_read_failed"),
    );
    return EMPTY;
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
  let inProgress = 0;
  let completed = 0;
  const groupCounts = new Map<RelationshipGroup, number>();
  const personCounts = new Map<string, number>();
  const personRows = new Map<
    string,
    { conversations: number; open: number; lastActivityAt: string | null }
  >();

  for (const t of threadsRes.data ?? []) {
    if (!surviving.has(t.thread_id)) continue; // deleted/empty thread
    total += 1;
    const isActive = t.status !== "completed"; // open | in_progress
    if (t.status === "open") open += 1;
    else if (t.status === "in_progress") inProgress += 1;
    else completed += 1;

    const person = t.person_id ? personById.get(t.person_id) : undefined;
    const group: RelationshipGroup = person
      ? (DOMAIN_TO_GROUP[person.domain as RelationshipDomain] ?? "other")
      : "other";
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    if (t.person_id && person) {
      personCounts.set(t.person_id, (personCounts.get(t.person_id) ?? 0) + 1);
      const row = personRows.get(t.person_id) ?? {
        conversations: 0,
        open: 0,
        lastActivityAt: null,
      };
      row.conversations += 1;
      if (isActive) row.open += 1;
      if (
        t.last_activity_at &&
        (!row.lastActivityAt ||
          new Date(t.last_activity_at).getTime() >
            new Date(row.lastActivityAt).getTime())
      ) {
        row.lastActivityAt = t.last_activity_at;
      }
      personRows.set(t.person_id, row);
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

  // Top 3 by open-conversation count (ties broken by most recent activity);
  // people with nothing open don't appear.
  const people: PersonOverviewRow[] = [...personRows.entries()]
    .map(([personId, row]) => ({
      personId,
      name: personById.get(personId)?.name ?? "Someone",
      ...row,
    }))
    .filter((p) => p.open > 0)
    .sort(
      (a, b) =>
        b.open - a.open ||
        new Date(b.lastActivityAt ?? 0).getTime() -
          new Date(a.lastActivityAt ?? 0).getTime(),
    )
    .slice(0, MAX_PEOPLE_ROWS);

  return {
    total,
    open,
    inProgress,
    completed,
    byGroup,
    topPeople,
    people,
    hasAny: total > 0,
  };
}
