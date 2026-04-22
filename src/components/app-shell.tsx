"use client";

import Link, { useLinkStatus } from "next/link";
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
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TABS = [
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/insights", label: "Insights", icon: BarChart3 },
];

// useLinkStatus must be called inside a descendant of <Link>, so the
// tap-feedback logic lives in a child component. `pending` flips true
// the instant the Link is tapped and false when the navigation
// resolves — lets us highlight the tab within one frame instead of
// waiting for usePathname() to update after the new route loads.
function TabIconAndLabel({
  icon: Icon,
  label,
  isActive,
}: {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
}) {
  const { pending } = useLinkStatus();
  const showActive = isActive || pending;
  const color = showActive ? "text-zinc-900" : "text-zinc-400";
  return (
    <>
      <Icon className={cn("h-5 w-5", color)} />
      <span className={color}>{label}</span>
    </>
  );
}

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
              <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                <Link
                  href="/history"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <Clock className="h-4 w-4" />
                  History
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
              // `active:opacity-70` is the CSS finger-down feedback;
              // icon/label color flip comes from useLinkStatus inside
              // TabIconAndLabel.
              className="flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-colors active:opacity-70"
            >
              <TabIconAndLabel
                icon={tab.icon}
                label={tab.label}
                isActive={isActive}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
