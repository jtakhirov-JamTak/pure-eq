"use client";

import { useRouter } from "next/navigation";
import { Kicker } from "@/components/ui/kicker";
import { stashReviewPrefill } from "@/lib/coach/review-prefill";
import type { OpenLoop } from "@/lib/coach/open-loops";

// ============================================================
// OpenConversations — the interactive top of the Conversations tab
// ============================================================
// A uniform "Pick up where you left off" list (one card per open loop, capped
// at the top 3 by the page). Each row's subtext is the generic "review how it
// landed" line — never the conversation title. Tapping a row stashes a Review
// prefill (person) and routes into Review — the Prepare→Review calibration link
// forms server-side off the person. Client-side so sessionStorage + the auth
// lookup run in the browser.
export function OpenConversations({ loops }: { loops: OpenLoop[] }) {
  const router = useRouter();

  async function resume(loop: OpenLoop) {
    await stashReviewPrefill({
      personName: loop.personName,
      personId: loop.personId,
      source: "loop_nudge",
    });
    router.push("/coach/review");
  }

  if (loops.length === 0) return null;

  return (
    <div>
      <Kicker className="text-accent-ink">Pick up where you left off</Kicker>
      <div className="mt-2 space-y-2">
        {loops.map((loop) => (
          <button
            key={loop.threadId}
            type="button"
            onClick={() => resume(loop)}
            className="flex w-full items-center justify-between gap-3 rounded-card border border-hairline bg-surface p-4 text-left transition active:scale-[0.99]"
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-ink">
                How did it go with {loop.personName}?
              </span>
              <span className="mt-0.5 block text-[13px] font-medium leading-[1.4] text-ink-soft">
                You prepared for this — review how it landed.
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-bold text-accent-ink">
              Review →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
