// Pure EQ domain — replace in fork.
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkAdmin } from "@/lib/admin";

const toggleSchema = z.object({
  targetUserId: z.string().uuid(),
  grant: z.boolean(),
});

/**
 * Grant or revoke full app access for a user.
 * Admin-only server action — called from the user list/detail pages.
 */
export async function toggleAccess(targetUserId: string, grant: boolean) {
  // Validate input.
  const parsed = toggleSchema.safeParse({ targetUserId, grant });
  if (!parsed.success) throw new Error("Invalid input");

  // Auth + admin check inside the action (defense in depth).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Forbidden");

  const sc = createServiceClient();
  const admin = await checkAdmin(user.email, sc, user.id);
  if (!admin) throw new Error("Forbidden");

  // Prevent admin from revoking their own access.
  if (targetUserId === user.id) throw new Error("Forbidden");

  const now = new Date().toISOString();

  // Check if the target user already has a subscription row.
  const { data: existing } = await sc
    .from("user_subscriptions")
    .select("subscription_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (existing) {
    await sc
      .from("user_subscriptions")
      .update({
        status: grant ? "active" : "cancelled",
        ...(grant ? { activated_at: now } : { cancelled_at: now }),
        updated_at: now,
      })
      .eq("user_id", targetUserId);
  } else if (grant) {
    // Create a subscription row for users who never had one.
    await sc.from("user_subscriptions").insert({
      user_id: targetUserId,
      status: "active",
      activated_at: now,
    });
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${targetUserId}`);
}
