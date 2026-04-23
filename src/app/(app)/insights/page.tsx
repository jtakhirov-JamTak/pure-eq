// Pure EQ domain — replace in fork.
// Temporary stub during the Insights rebuild. The tag-counter /
// 3-box system was removed in Commit A of the weekly-reflection
// rollout; the new ReflectionCard lands in Commit C. In between,
// paid users see StyleBox + a "coming soon" placeholder so the
// route is never broken.
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requirePaidAccessPage } from "@/lib/require-access";
import {
  PROFILE_DESCRIPTIONS,
  PROFILE_AVATAR_CLASSES,
  getLatestProfile,
} from "@/lib/onboarding";
import type { ProfileType } from "@/types";
import { StyleBox } from "@/components/insights/StyleBox";
import { SkyBackground } from "@/components/brand/SkyBackground";

export default async function InsightsPage() {
  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  await requirePaidAccessPage(user);

  const profile = await getLatestProfile(supabase, user.id);
  const primary = profile?.primary_profile as ProfileType | undefined;
  const secondary = profile?.secondary_profile as ProfileType | null;

  return (
    <div className="relative min-h-full px-5 pt-4 pb-32">
      <SkyBackground variant="calm" />

      <div className="pt-2">
        <span className="inline-block rounded-pill bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-[0.8px] text-white">
          Insights
        </span>
        <h1
          className="mt-2.5 font-display text-[32px] leading-[1.08] text-ink"
          style={{ letterSpacing: "-1px" }}
        >
          Your <span className="italic">patterns</span> are who you are.
        </h1>
      </div>

      {primary ? (
        <StyleBox
          primary={primary}
          secondary={secondary ?? null}
          description={PROFILE_DESCRIPTIONS[primary]}
          avatarColorClass={PROFILE_AVATAR_CLASSES[primary]}
        />
      ) : (
        <div className="mt-4 rounded-card-sm bg-surface p-5 shadow-soft">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
            Your style
          </p>
          <p className="mt-2 text-[13px] font-medium text-ink-soft">
            Complete onboarding to see your profile here.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-card-sm bg-surface p-5 shadow-soft">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
          Your weekly reflection
        </p>
        <p className="mt-2 text-[13px] font-medium leading-[1.5] text-ink-soft">
          Your weekly reflection is coming soon. Keep using Coach and Tools —
          once you have enough entries, we&apos;ll surface blind-spot
          observations here with direct quotes from your own words.
        </p>
      </div>
    </div>
  );
}
