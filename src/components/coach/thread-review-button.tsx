"use client";

import { useRouter } from "next/navigation";
import { stashReviewPrefill } from "@/lib/coach/review-prefill";

// "Review" action on a thread detail page (Phase 2). Routes into Review with the
// thread's person pre-selected so the Prepare→Review calibration link forms
// server-side. Client-side so the sessionStorage stash + auth lookup run in the
// browser. Only used when the thread has a person.
export function ThreadReviewButton({
  personName,
  personId,
}: {
  personName: string;
  personId: string | null;
}) {
  const router = useRouter();

  async function go() {
    await stashReviewPrefill({ personName, personId, source: "thread" });
    router.push("/coach/review");
  }

  return (
    <button
      type="button"
      onClick={go}
      className="rounded-pill border border-hairline bg-surface px-4 py-2 text-[13px] font-semibold text-ink active:opacity-80"
    >
      Review
    </button>
  );
}
