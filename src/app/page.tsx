import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLatestProfile } from "@/lib/onboarding";
import { Wordmark } from "@/components/brand/Wordmark";
import { StormBackground } from "@/components/brand/StormBackground";

export default async function LandingPage() {
  // Authed users don't belong on the marketing page. With a profile they
  // land on /coach (home); without one, they finish the quiz first.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const profile = await getLatestProfile(supabase, user.id);
    redirect(profile ? "/coach" : "/onboarding");
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 pb-[env(safe-area-inset-bottom)] pt-[max(3rem,env(safe-area-inset-top))]">
      <StormBackground />

      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center">
          <Wordmark size={24} />
        </div>
        <h1
          className="mt-10 font-display text-[40px] font-medium leading-[1.05] text-ink"
          style={{ letterSpacing: "-1.2px" }}
        >
          Hard conversations,
          <br />
          <span className="italic">handled</span>.
        </h1>
        <p className="mt-4 text-[15px] font-medium leading-[1.5] text-ink-soft">
          Build self-awareness, emotional regulation, and empathic accuracy —
          before, during, and after difficult interactions.
        </p>

        <Link
          href="/onboarding"
          className="mt-10 flex h-14 w-full items-center justify-center rounded-pill bg-accent text-[15px] font-bold text-accent-text shadow-cta active:scale-[0.98]"
        >
          Get your communication profile in 90s
        </Link>

        <p className="mt-6 text-[13px] font-medium text-ink-soft">
          Already have an account?{" "}
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center px-2 text-[13px] font-semibold text-accent-ink underline active:opacity-70"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
