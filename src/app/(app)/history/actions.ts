"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BATCH_SIZE = 10;

// record_type (in raw_records) → matching derived table.
// `onboarding_profile` is intentionally excluded: retake flow appends new
// rows and the routing hub reads the latest; deleting a snapshot would
// corrupt the audit trail of how a user's profile evolved.
// `outcome_tracking` is a follow-up PATCH to an existing coach entry
// (not its own module entry) and belongs with the source, not a separate
// row in the history list.
const DERIVED_TABLE = {
  prepare: "prepare_entries",
  review: "review_entries",
  before_you_send: "before_you_send_entries",
  repair: "repair_entries",
  trigger_log: "trigger_entries",
  overwhelmed: "overwhelmed_entries",
} as const;

type DeletableRecordType = keyof typeof DERIVED_TABLE;

function isDeletable(t: string): t is DeletableRecordType {
  return t in DERIVED_TABLE;
}

export async function softDeleteEntries(
  rawRecordIds: string[]
): Promise<{ success: boolean; deleted: number; error?: string }> {
  if (!Array.isArray(rawRecordIds) || rawRecordIds.length === 0) {
    return { success: false, deleted: 0, error: "No entries selected" };
  }
  if (rawRecordIds.length > MAX_BATCH_SIZE) {
    return { success: false, deleted: 0, error: "Too many entries in one batch" };
  }
  for (const id of rawRecordIds) {
    if (typeof id !== "string" || !UUID_RE.test(id)) {
      return { success: false, deleted: 0, error: "Invalid entry id" };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, deleted: 0, error: "Not authenticated" };
  }

  const rlMin = await rateLimit(`history-delete:min:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rlMin.allowed) {
    return { success: false, deleted: 0, error: "Too many requests" };
  }
  // Day bucket: caps mass-erase by a compromised session at ~1k entries/day.
  const rlDay = await rateLimit(`history-delete:day:${user.id}`, {
    limit: 500,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rlDay.allowed) {
    return { success: false, deleted: 0, error: "Daily limit reached" };
  }

  // Fetch record types for the selected ids (scoped to this user + not
  // already soft-deleted). Anything missing here is either someone else's
  // row or a stale client-side id; silently skipped.
  const { data: records, error: fetchErr } = await supabase
    .from("raw_records")
    .select("raw_record_id, record_type")
    .eq("user_id", user.id)
    .in("raw_record_id", rawRecordIds)
    .is("deleted_at", null);

  if (fetchErr) {
    console.error("history-delete: fetch failed", fetchErr.code);
    return { success: false, deleted: 0, error: "Could not delete" };
  }
  if (!records || records.length === 0) {
    return { success: true, deleted: 0 };
  }

  const now = new Date().toISOString();
  const validIds = records
    .filter((r) => isDeletable(r.record_type))
    .map((r) => r.raw_record_id);

  if (validIds.length === 0) {
    return { success: true, deleted: 0 };
  }

  // 1) Soft-delete raw_records rows.
  const { error: rawErr } = await supabase
    .from("raw_records")
    .update({ deleted_at: now })
    .eq("user_id", user.id)
    .in("raw_record_id", validIds)
    .is("deleted_at", null);
  if (rawErr) {
    console.error("history-delete: raw update failed", rawErr.code);
    return { success: false, deleted: 0, error: "Could not delete" };
  }

  // 2) Soft-delete matching derived rows, grouped by table to avoid per-row
  // round trips. One UPDATE per affected derived table.
  const byType = new Map<DeletableRecordType, string[]>();
  for (const r of records) {
    if (!isDeletable(r.record_type)) continue;
    const list = byType.get(r.record_type) ?? [];
    list.push(r.raw_record_id);
    byType.set(r.record_type, list);
  }

  // Partial-failure awareness: Promise.all swallows errors unless each
  // result is checked. If any derived-table UPDATE fails, we still want
  // to surface that to the caller instead of reporting success while
  // leaving orphans (raw marked deleted, derived row still visible to
  // module-specific queries).
  const derivedResults = await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      switch (type) {
        case "prepare":
          return supabase
            .from("prepare_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
        case "review":
          return supabase
            .from("review_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
        case "before_you_send":
          return supabase
            .from("before_you_send_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
        case "repair":
          return supabase
            .from("repair_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
        case "trigger_log":
          return supabase
            .from("trigger_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
        case "overwhelmed":
          return supabase
            .from("overwhelmed_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
      }
    })
  );
  const derivedErrors = derivedResults.filter((r) => r?.error);
  if (derivedErrors.length > 0) {
    for (const r of derivedErrors) {
      console.error("history-delete: derived update failed", r?.error?.code);
    }
    return {
      success: false,
      deleted: 0,
      error: "Some entries could not be fully deleted. Try again.",
    };
  }

  revalidatePath("/history");

  return { success: true, deleted: validIds.length };
}
