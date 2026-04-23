import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Subscription gating happens at the page layer below so we can (a)
  // render a locked card on the /tools hub for users outside the window
  // and (b) redirect leaf pages to /paywall before journaling UI renders.
  return <AppShell userEmail={user.email}>{children}</AppShell>;
}
