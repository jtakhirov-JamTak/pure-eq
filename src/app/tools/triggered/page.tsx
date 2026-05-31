// Pure EQ domain — replace in fork.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TriggeredClient from "./triggered-client";

export default async function TriggeredPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Coins redesign Phase 3: Tools are free (login-only).
  return <TriggeredClient />;
}
