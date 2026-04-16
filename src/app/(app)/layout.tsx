import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkSubscription } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";
import { AppShell } from "./app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware should have caught unauthed users, but be safe.
  if (!user) {
    redirect("/login");
  }

  // Admin bypass: admins skip the subscription gate entirely.
  if (!isAdmin(user.email)) {
    // Subscription gate: if free Prepare is used and user isn't subscribed,
    // redirect to paywall. Users who haven't used their free Prepare yet
    // can access the app to do their one free Prepare.
    // Note: unsubscribed users who haven't used their free Prepare can
    // browse pages, but API routes will 403 on Review/Tools submissions.
    // Client pages handle 403 by redirecting to /paywall.
    const access = await checkSubscription(supabase, user.id);
    if (access.freePrepareUsed && !access.hasAccess) {
      redirect("/paywall");
    }
  }

  return <AppShell>{children}</AppShell>;
}
