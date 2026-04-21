import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { checkSubscription } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t0 = Date.now();
  // getAuthUser is React.cache()-wrapped — shares the JWT validation
  // round trip with the page below.
  const {
    data: { user },
  } = await getAuthUser();

  // Middleware should have caught unauthed users, but be safe.
  if (!user) {
    redirect("/login");
  }

  // Admin bypass: admins skip the subscription gate entirely.
  if (!isAdmin(user.email)) {
    // Subscription gate: users get a 3-day free period from signup to
    // complete 1 Prepare + 1 Review. After that, paywall.
    const access = await checkSubscription(user.id);
    const bothFreeUsed = access.freePrepareUsed && access.freeReviewUsed;
    const freePeriodExpired = !access.freePeriodActive;
    if (!access.hasAccess && (bothFreeUsed || freePeriodExpired)) {
      redirect("/paywall");
    }
  }

  console.log(`[perf] (app) layout ${Date.now() - t0}ms u=${user.id.slice(0, 8)}`);
  return <AppShell>{children}</AppShell>;
}
