// Pure EQ domain — replace in fork.
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkAdmin } from "@/lib/admin";

export default async function AdminLayout({
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

  // Return 404 for non-admins — hides the route's existence.
  const serviceClient = createServiceClient();
  const admin = await checkAdmin(user.email, serviceClient, user.id);
  if (!admin) {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-900">
            SpeakEasy Admin
          </h1>
          <nav className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/users"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              Users
            </Link>
            <Link
              href="/coach"
              className="text-sm text-zinc-400 hover:text-zinc-600"
            >
              Back to App
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
