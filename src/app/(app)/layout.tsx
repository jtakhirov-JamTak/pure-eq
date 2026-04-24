import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { checkSubscription } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";
import { readFirstName } from "@/lib/user-metadata";

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
    // Coach backstop: redirect to paywall only when the user has exhausted
    // every Coach free use (Prepare + Review + Before-You-Send) OR the free
    // period has elapsed. Until then, the individual Coach surfaces rely on
    // their API-side `free_one` reservations — so a user with 2 of 3 free
    // uses burned can still reach the 3rd. Other paid surfaces
    // (/insights, /history, /coach/threads*, /coach/repair) gate themselves
    // via requirePaidAccessPage.
    const access = await checkSubscription(user.id);
    const allCoachFreeUsed =
      access.freePrepareUsed &&
      access.freeReviewUsed &&
      access.freeBeforeYouSendUsed;
    const freePeriodExpired = !access.freePeriodActive;
    if (!access.hasAccess && (allCoachFreeUsed || freePeriodExpired)) {
      redirect("/paywall");
    }
  }

  console.log(`[perf] (app) layout ${Date.now() - t0}ms u=${user.id.slice(0, 8)}`);
  return (
    <AppShell
      userEmail={user.email}
      firstName={readFirstName(user.user_metadata)}
    >
      {children}
    </AppShell>
  );
}
