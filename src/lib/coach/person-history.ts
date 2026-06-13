// ============================================================
// Person history — the /people/[personId] data layer
// ============================================================
// The relationship-centric view: ONE person, their whole tracked history —
// every conversation (open AND closed; reuses getConversationSummaries so the
// topic/origin/headline/survival logic is single-source), plus the regulation
// moments and draft checks linked to them. Founder framing (2026-06-12):
// "with Matt I might have one prepare open and one reviewed and closed — the
// relationship with Matt is tracked in its entirety; that's the value."
//
// Read-only; every query inspects .error per the server-component read lesson.
import { createClient } from "@/lib/supabase/server";
import { captureServerRead } from "@/lib/read-capture";
import type { RelationshipDomain } from "@/types";
import {
  getConversationSummaries,
  type ConversationSummary,
} from "./conversation-summary";

// Non-conversation entries linked to this person: in-the-moment regulation
// logs + Before-You-Send draft checks. Date + type only (v0) — the value is
// seeing WHEN the relationship spiked, not re-reading each entry.
// Writers: the Triggered/Overwhelmed tools' optional "was this about
// someone?" step (2026-06-12). BYS stays personless (personBehavior "skip"),
// so before_you_send is here only for forward-compat — it matches nothing
// today.
export type PersonMoment = {
  recordType: "trigger_log" | "overwhelmed" | "before_you_send";
  createdAt: string;
};

export type PersonHistory = {
  person: {
    personId: string;
    name: string;
    domain: RelationshipDomain;
    createdAt: string; // tracking since
  };
  // open counts open + in_progress (anything still live).
  stats: { total: number; open: number; completed: number };
  conversations: ConversationSummary[]; // newest first
  moments: PersonMoment[]; // newest first
};

const MOMENT_TYPES = ["trigger_log", "overwhelmed", "before_you_send"] as const;

// The 5 valid relationship domains (migration 0052), for runtime narrowing of
// the DB string (§16.14: no blind `as` on union-typed columns). Unknown or
// un-migrated legacy values (e.g. an old 'partner'/'coworker') → "other".
const KNOWN_DOMAINS: readonly RelationshipDomain[] = [
  "romantic",
  "friend",
  "family",
  "work",
  "other",
];

export async function getPersonHistory(
  userId: string,
  personId: string,
): Promise<PersonHistory | null> {
  const supabase = await createClient();

  // Ownership + existence: filter by user_id (never trust a client id alone).
  const personRes = await supabase
    .from("persons")
    .select("person_id, display_name, relationship_domain, created_at")
    .eq("user_id", userId)
    .eq("person_id", personId)
    .maybeSingle();
  if (personRes.error) {
    // Fail loudly: a transient DB error must NOT render as a 404 ("this page
    // doesn't exist") — throw so the error boundary shows a retryable state.
    captureServerRead(
      "person_history",
      "persons",
      new Error("person_history_person_read_failed"),
    );
    throw new Error("person_history_person_read_failed");
  }
  if (!personRes.data) return null;

  const [{ summaries }, momentsRes] = await Promise.all([
    // Reuse the All-conversations data layer, narrowed to this person IN THE
    // QUERY — so the 1000-row cap applies per person, and the page can't
    // disagree with the People-row counts once the user's total thread count
    // passes the cap.
    getConversationSummaries(userId, { personId }),
    supabase
      .from("raw_records")
      .select("record_type, created_at")
      .eq("user_id", userId)
      .eq("person_id", personId)
      .in("record_type", [...MOMENT_TYPES])
      .eq("is_complete", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (momentsRes.error) {
    captureServerRead(
      "person_history",
      "raw_records",
      new Error("person_history_moments_read_failed"),
    );
  }

  // Already narrowed to this person at the query level. The 3 statuses
  // partition cleanly: open counts open + in_progress, the rest is completed.
  const conversations = summaries;
  let open = 0;
  let resolved = 0;
  for (const c of conversations) {
    if (c.status === "completed") resolved += 1;
    else open += 1;
  }

  const rawDomain = personRes.data.relationship_domain;
  const domain: RelationshipDomain = (
    KNOWN_DOMAINS as readonly string[]
  ).includes(rawDomain)
    ? (rawDomain as RelationshipDomain)
    : "other";

  return {
    person: {
      personId: personRes.data.person_id,
      name: personRes.data.display_name,
      domain,
      createdAt: personRes.data.created_at,
    },
    stats: { total: conversations.length, open, completed: resolved },
    conversations,
    moments: (momentsRes.data ?? [])
      .filter((m) => (MOMENT_TYPES as readonly string[]).includes(m.record_type))
      .map((m) => ({
        recordType: m.record_type as PersonMoment["recordType"],
        createdAt: m.created_at,
      })),
  };
}
