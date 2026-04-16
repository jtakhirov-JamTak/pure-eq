// Service role client — bypasses RLS for admin queries.
// ONLY import this in admin server components and server actions.
// NEVER import in client components, non-admin routes, or middleware.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SECRET_KEY!
  );
}
