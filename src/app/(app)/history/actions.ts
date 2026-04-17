"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { regenerateInsights } from "@/lib/insights-writer";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BATCH_SIZE = 10;

// record_type (in raw_records) → matching derived table name. onboarding_profile
// and outcome_tracking are intentionally absent: they aren't deletable through
// the history surface.
const DERIVED_TABLE = {
  prepare: "prepare_entries",
  review: "review_entries",
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

  const rl = await rateLimit(`history-delete:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return { success: false, deleted: 0, error: "Too many requests" };
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

  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      switch (type) {
        case "prepare":
          await supabase
            .from("prepare_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
          return;
        case "review":
          await supabase
            .from("review_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
          return;
        case "repair":
          await supabase
            .from("repair_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
          return;
        case "trigger_log":
          await supabase
            .from("trigger_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
          return;
        case "overwhelmed":
          await supabase
            .from("overwhelmed_entries")
            .update({ deleted_at: now })
            .eq("user_id", user.id)
            .in("raw_record_id", ids);
          return;
      }
    })
  );

  // 3) Hard-delete pattern_observations derived from these entries.
  // Observations are rebuildable from raw_records if undelete ever ships,
  // and leaving them around means deleted entries keep shaping insights.
  await supabase
    .from("pattern_observations")
    .delete()
    .eq("user_id", user.id)
    .in("source_raw_record_id", validIds);

  // 4) Rebuild cached insights so the user sees the effect immediately.
  regenerateInsights(supabase, user.id).catch(() => {
    console.error("history-delete: insight regeneration failed");
  });

  revalidatePath("/history");
  revalidatePath("/insights");

  return { success: true, deleted: validIds.length };
}
