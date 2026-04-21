// Pure EQ domain — replace in fork.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireToolsAccessPage } from "@/lib/require-access";
import OverwhelmedClient from "./overwhelmed-client";

export default async function OverwhelmedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireToolsAccessPage(user);
  return <OverwhelmedClient />;
}
