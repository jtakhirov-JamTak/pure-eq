import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verify that a person_id belongs to the authenticated user and is active.
 * RLS scopes the query, but the explicit user_id filter is belt-and-suspenders
 * to prevent FK-based linking to another user's person via a crafted request.
 */
export async function verifyPersonOwnership(
  supabase: SupabaseClient,
  userId: string,
  personId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("persons")
    .select("person_id")
    .eq("person_id", personId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}
