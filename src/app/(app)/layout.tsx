import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { readFirstName } from "@/lib/user-metadata";
import { getBalance } from "@/lib/coins";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getAuthUser is React.cache()-wrapped — shares the JWT validation
  // round trip with the page below.
  const {
    data: { user },
  } = await getAuthUser();

  // Middleware should have caught unauthed users, but be safe.
  if (!user) {
    redirect("/login");
  }

  // Coins redesign Slice B Phase 3 (2026-05-30): the old Coach paywall backstop
  // is retired. Manual Coach flows (saving entries) are free; AI feedback is
  // coin-gated at the API (run-module spends coins only on generateAi:true).
  // As of B3, Insights is coin-gated too (charged on tap in its own page), so
  // this layout is now an auth gate only — no surface still uses the paywall.

  // Balance powers the always-visible header coin pill. Fails closed to 0 on a
  // DB error (getBalance contract). Reflects the value at page render; spending
  // coins in a flow refreshes it on the next navigation/revalidate.
  const balance = await getBalance(user.id);

  return (
    <AppShell
      userEmail={user.email}
      firstName={readFirstName(user.user_metadata)}
      balance={balance}
    >
      {children}
    </AppShell>
  );
}
