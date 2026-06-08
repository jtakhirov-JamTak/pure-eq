import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { readFirstName } from "@/lib/user-metadata";

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

  // Tools are free (auth-only) — no gating here. This layout just enforces
  // login and wraps the subtree in the shared AppShell. (Tools live outside
  // the (app) group so the retired free-window gate couldn't catch them; the
  // gate is gone now, but the placement is kept — see CLAUDE.md.)
  return (
    <AppShell
      userEmail={user.email}
      firstName={readFirstName(user.user_metadata)}
    >
      {children}
    </AppShell>
  );
}
