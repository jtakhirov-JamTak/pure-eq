// Pure EQ domain — replace in fork.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePaidAccessPage } from "@/lib/require-access";
import RepairClient from "./repair-client";

// Paid-only surface. Gate runs server-side BEFORE the journaling UI
// renders, matching the Tools pattern. API `/api/coach/repair` has its
// own `subscriptionGate: "required"` check; this wrapper prevents an
// unpaid user from filling out the multi-step form only to 403 on submit.
export default async function RepairPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requirePaidAccessPage(user);
  return <RepairClient />;
}
