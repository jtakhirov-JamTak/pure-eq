// Pure EQ domain — replace in fork.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Fast, sync admin check via env var. Use in hot paths (layout gate,
 * API routes) where a DB call would add latency to every request.
 */
export function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}

/**
 * Full admin check: env var (fast) then DB role column (authoritative).
 * Use in admin pages where the extra DB call is acceptable.
 */
export async function checkAdmin(
  email: string | undefined,
  serviceClient: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  // Fast path: env var match
  if (isAdmin(email)) return true;

  // Slow path: DB role check (supports multiple admins without code deploy)
  const { data } = await serviceClient
    .from("user_subscriptions")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.role === "admin";
}
