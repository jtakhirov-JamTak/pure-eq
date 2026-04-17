// Service role client — bypasses RLS for privileged writes.
// Used by admin routes, subscription.ts (reserveFreeUse, createSubscription,
// lazy trial expiry), and any other path that must write to RLS-pinned
// columns. NEVER import in client components or middleware.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "createServiceClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set"
    );
  }
  return createClient<Database>(url, secretKey);
}
