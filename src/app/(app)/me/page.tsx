import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Coins, Settings, ChevronRight, Download } from "lucide-react";
import { StormBackground } from "@/components/brand/StormBackground";
import { readFirstName } from "@/lib/user-metadata";
import { SignOutButton } from "@/components/sign-out-button";
import {
  PROFILE_DESCRIPTIONS,
  PROFILE_AVATAR_CLASSES,
  getLatestProfile,
} from "@/lib/onboarding";
import type { ProfileType } from "@/types";
import { StyleBox } from "@/components/insights/StyleBox";
import { Card } from "@/components/ui/card";
import { Kicker } from "@/components/ui/kicker";
import { isAdmin } from "@/lib/admin";

// Me tab (router nav): gathers the account surfaces that used to live in the
// header avatar menu. The Communication Profile lives here as the StyleBox at
// the top (with its own retake link). History is gone — past conversations now
// live in the Conversations tab. Reading screen.
const LINKS = [
  { href: "/settings", label: "Settings", Icon: Settings },
  { href: "/coins", label: "Coins", Icon: Coins },
];

export default async function MePage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const profile = await getLatestProfile(supabase, user.id);
  const primary = profile?.primary_profile as ProfileType | undefined;
  const secondary = profile?.secondary_profile as ProfileType | null;

  const firstName = readFirstName(user.user_metadata);
  const admin = isAdmin(user.email);

  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <StormBackground />

      <div className="mb-6 pt-2">
        <h1
          className="font-display text-[28px] font-medium leading-[1.1] text-ink sm:text-[34px]"
          style={{ letterSpacing: "-0.7px" }}
        >
          {firstName ? `${firstName}` : "Your account"}
        </h1>
        {user.email && (
          <p className="mt-1 text-[14px] font-medium text-ink-soft">
            {user.email}
          </p>
        )}
      </div>

      {primary ? (
        <StyleBox
          primary={primary}
          secondary={secondary ?? null}
          description={PROFILE_DESCRIPTIONS[primary]}
          avatarColorClass={PROFILE_AVATAR_CLASSES[primary]}
        />
      ) : (
        <Card className="mb-4 p-5">
          <Kicker>Your style</Kicker>
          <p className="mt-2 text-[13px] font-medium text-ink-soft">
            Complete onboarding to see your profile here.
          </p>
          <Link
            href="/onboarding?retake=1"
            className="mt-2 inline-flex min-h-11 items-center text-[12px] font-medium text-ink-soft underline active:opacity-70"
          >
            Set up Communication Profile
          </Link>
        </Card>
      )}

      <div className="mt-4 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface/70 shadow-dark">
        {LINKS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-14 items-center gap-3 px-4 py-3.5 transition active:bg-surface-tint"
          >
            <Icon className="h-5 w-5 text-ink-soft" />
            <span className="flex-1 font-medium text-ink">{label}</span>
            <ChevronRight className="h-4 w-4 text-ink-soft" />
          </Link>
        ))}
      </div>

      {/* Data export is admin-only (gated server-side at /api/export). Kept hard
          to reach by design — not a self-serve button. */}
      {admin && (
        <a
          href="/api/export"
          download
          className="mt-4 flex min-h-14 items-center gap-3 rounded-card border border-hairline bg-surface/70 px-4 py-3.5 shadow-dark transition active:bg-surface-tint"
        >
          <Download className="h-5 w-5 text-ink-soft" />
          <span className="flex-1 font-medium text-ink">
            Download my data (.txt)
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-ink-muted">
            Admin
          </span>
        </a>
      )}

      <SignOutButton className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-card border border-hairline bg-surface/70 px-4 py-3.5 shadow-dark transition active:bg-surface-tint" />
    </div>
  );
}
