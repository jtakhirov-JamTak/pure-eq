// Pure EQ domain — replace in fork.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLatestProfile } from "@/lib/onboarding";
import OnboardingClient from "./onboarding-client";

// Server gate for /onboarding. A returning user with a saved Communication
// Profile is redirected server-side to /coach — no quiz-scaffold flash.
// Users in the sessionStorage-flush state (pre-auth quiz completion, then
// signed up) have no profile yet, so they fall through and the client
// component handles the flush. `?retake=1` bypasses the check so users can
// re-answer the quiz.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ retake?: string }>;
}) {
  const { retake } = await searchParams;
  const isRetake = retake === "1";

  if (!isRetake) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const profile = await getLatestProfile(supabase, user.id);
      if (profile) redirect("/coach");
    }
  }

  return <OnboardingClient />;
}
