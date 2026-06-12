// ============================================================
// Tools person resolution — the optional "who was this about?" link
// ============================================================
// Both manual tools (Triggered, Overwhelmed) accept an optional person on the
// final step. Mirrors run-module step 7's contract without importing it (the
// coach version is interwoven with module config): never trust a client id
// (ownership check), dedup a typed name against active persons before
// creating, default new persons to relationship "other" (the tools don't ask).
// BYS deliberately has no person concept — don't wire this into it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyPersonOwnership } from "@/lib/verify-ownership";

export type ResolvedToolsPerson =
  | { ok: true; personId: string | null }
  | { ok: false; error: "invalid_person" };

export async function resolveToolsPerson(
  supabase: SupabaseClient,
  userId: string,
  personId: string | null | undefined,
  personName: string | null | undefined,
): Promise<ResolvedToolsPerson> {
  if (personId) {
    const owns = await verifyPersonOwnership(supabase, userId, personId);
    if (!owns) return { ok: false, error: "invalid_person" };
    await supabase
      .from("persons")
      .update({ updated_at: new Date().toISOString() })
      .eq("person_id", personId)
      .eq("user_id", userId);
    return { ok: true, personId };
  }

  const name = personName?.trim();
  if (!name) return { ok: true, personId: null };

  // Dedup by name only (the tools collect no relationship — same rule as
  // Review). SELECT-before-INSERT per the auto-create person lesson.
  const { data: existing } = await supabase
    .from("persons")
    .select("person_id")
    .eq("user_id", userId)
    .eq("display_name", name)
    .eq("is_active", true)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("persons")
      .update({ updated_at: new Date().toISOString() })
      .eq("person_id", existing.person_id)
      .eq("user_id", userId);
    return { ok: true, personId: existing.person_id };
  }

  const { data: created, error: createErr } = await supabase
    .from("persons")
    .insert({
      user_id: userId,
      display_name: name,
      relationship_domain: "other",
    })
    .select("person_id")
    .single();
  if (createErr || !created) {
    // The person link is optional garnish on a regulation entry — never fail
    // the save over it. Entry persists unlinked.
    return { ok: true, personId: null };
  }
  return { ok: true, personId: created.person_id };
}
