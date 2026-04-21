// Pure EQ domain — replace in fork.
// IMPORTANT: This page MUST stay outside the (app) route group.
// Moving it inside (app) would create an infinite redirect loop:
// (app)/layout → /paywall → (app)/layout → /paywall → ...
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkSubscription } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";
import { PaywallContent } from "./paywall-content";

export default async function PaywallPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in — middleware should have caught this, but be safe.
  if (!user) {
    redirect("/login");
  }

  // Admin never sees paywall.
  if (isAdmin(user.email)) {
    redirect("/coach");
  }

  // Already subscribed — send to app.
  const access = await checkSubscription(user.id);
  if (access.hasAccess) {
    redirect("/coach");
  }

  return <PaywallContent />;
}
