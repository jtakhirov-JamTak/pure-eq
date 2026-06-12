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
    isActive: boolean;
  };
  stats: { total: number; open: number; resolved: number };
  conversations: ConversationSummary[]; // newest first
  moments: PersonMoment[]; // newest first
};

const MOMENT_TYPES = ["trigger_log", "overwhelmed", "before_you_send"] as const;

export async function getPersonHistory(
  userId: string,
  personId: string,
): Promise<PersonHistory | null> {
  const supabase = await createClient();

  // Ownership + existence: filter by user_id (never trust a client id alone).
  const personRes = await supabase
    .from("persons")
    .select("person_id, display_name, relationship_domain, created_at, is_active")
    .eq("user_id", userId)
    .eq("person_id", personId)
    .maybeSingle();
  if (personRes.error) {
    captureServerRead(
      "person_history",
      "persons",
      new Error("person_history_person_read_failed"),
    );
    return null;
  }
  if (!personRes.data) return null;

  const [{ summaries }, momentsRes] = await Promise.all([
    // Reuse the All-conversations data layer and filter to this person — the
    // 100-thread cap is shared (acceptable: a single person's conversations
    // are a subset of the newest 100).
    getConversationSummaries(userId),
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

  const conversations = summaries.filter((s) => s.personId === personId);
  let open = 0;
  let resolved = 0;
  for (const c of conversations) {
    if (c.status === "open" || c.status === "stabilizing") open += 1;
    else if (c.status === "resolved" || c.status === "ended") resolved += 1;
  }

  return {
    person: {
      personId: personRes.data.person_id,
      name: personRes.data.display_name,
      domain: personRes.data.relationship_domain as RelationshipDomain,
      createdAt: personRes.data.created_at,
      isActive: personRes.data.is_active,
    },
    stats: { total: conversations.length, open, resolved },
    conversations,
    moments: (momentsRes.data ?? [])
      .filter((m) => (MOMENT_TYPES as readonly string[]).includes(m.record_type))
      .map((m) => ({
        recordType: m.record_type as PersonMoment["recordType"],
        createdAt: m.created_at,
      })),
  };
}
