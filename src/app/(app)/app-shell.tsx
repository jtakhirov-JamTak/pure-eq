"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  Wrench,
  BarChart3,
  User,
  LogOut,
  Database,
} from "lucide-react";

const TABS = [
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/insights", label: "Insights", icon: BarChart3 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-100 px-4">
        <h1 className="text-base font-semibold text-zinc-900">Pure EQ</h1>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200"
          >
            <User className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                <Link
                  href="/account"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <User className="h-4 w-4" />
                  Account
                </Link>
                <Link
                  href="/data"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <Database className="h-4 w-4" />
                  Data
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <LogOut className="h-4 w-4" />
                  Log Out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-zinc-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-colors",
                isActive ? "text-zinc-900" : "text-zinc-400"
              )}
            >
              <tab.icon
                className={cn("h-5 w-5", isActive ? "text-zinc-900" : "text-zinc-400")}
              />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
