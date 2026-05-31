"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Clock, Coins, LogOut, Settings } from "lucide-react";
import { Wordmark } from "./brand/Wordmark";

const TABS = [
  { href: "/coach", label: "Coach" },
  { href: "/tools", label: "Tools" },
  { href: "/insights", label: "Insights" },
];

// useLinkStatus must be called inside a descendant of <Link>. `pending`
// flips true the instant the Link is tapped so the active styles
// apply within one frame — no wait for usePathname() to update post-nav.
function TabLabel({
  label,
  isActive,
}: {
  label: string;
  isActive: boolean;
}) {
  const { pending } = useLinkStatus();
  const showActive = isActive || pending;
  return (
    <span
      className={cn(
        "flex h-full w-full items-center justify-center rounded-[22px] text-[13px] font-bold tracking-[-0.1px] transition-colors duration-200",
        showActive
          ? "bg-brand text-white shadow-cta"
          : "text-ink-soft hover:text-ink",
      )}
    >
      {label}
    </span>
  );
}

function avatarInitial(
  firstName: string | null | undefined,
  email: string | null | undefined,
): string {
  const fn = firstName?.trim();
  if (fn) return fn.charAt(0).toUpperCase();
  if (!email) return "?";
  const prefix = email.split("@")[0] ?? "";
  const ch = prefix.charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

export function AppShell({
  children,
  userEmail,
  firstName,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  firstName?: string | null;
}) {
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
    <div className="relative flex min-h-dvh flex-col">
      {/* Top bar — transparent; pages own their background */}
      <header className="relative z-20 flex shrink-0 items-center justify-between px-5 pb-3 pt-[max(env(safe-area-inset-top),1.25rem)]">
        <Link
          href="/coach"
          aria-label="SpeakEasy home"
          className="flex items-center active:opacity-80"
        >
          <Wordmark size={15} />
        </Link>

        <div className="relative">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-[14px] font-bold text-ink shadow-soft transition active:scale-95"
          >
            {avatarInitial(firstName, userEmail)}
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-[20px] bg-surface py-1 shadow-card">
                <Link
                  href="/coins"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-tint"
                >
                  <Coins className="h-4 w-4" />
                  Coins
                </Link>
                <Link
                  href="/history"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-tint"
                >
                  <Clock className="h-4 w-4" />
                  History
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-tint"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-tint"
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
      <main className="relative z-10 flex-1 overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      {/* Bottom tab bar — 48px pill with blur */}
      <nav
        className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] left-0 right-0 z-30 mx-5 flex gap-1 rounded-pill border border-white/80 bg-white/90 p-1.5 shadow-soft backdrop-blur-[18px]"
        aria-label="Primary"
      >
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex h-12 flex-1 active:opacity-80"
            >
              <TabLabel label={tab.label} isActive={isActive} />
            </Link>
          );
        })}
      </nav>

    </div>
  );
}
