"use client";

import { useRouter } from "next/navigation";
import { Kicker } from "@/components/ui/kicker";
import { stashReviewPrefill } from "@/lib/coach/review-prefill";
import type { OpenLoop } from "@/lib/coach/open-loops";

// ============================================================
// OpenConversations — the interactive top of the Conversations tab
// ============================================================
// loops[0] becomes the prominent "Pick up where you left off" card; the rest
// render as a "Review open conversations" list. Tapping either stashes a Review
// prefill (person) and routes into Review — the Prepare→Review calibration link
// forms server-side off the person. Client-side so sessionStorage + the auth
// lookup run in the browser (same mechanism as the Home-hub LoopNudge).
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

  const [primary, ...rest] = loops;

  return (
    <div>
      <Kicker className="text-accent-ink">Pick up where you left off</Kicker>
      <button
        type="button"
        onClick={() => resume(primary)}
        className="mt-2.5 flex w-full items-center justify-between gap-3 rounded-card border border-hairline bg-surface p-5 text-left shadow-dark transition active:scale-[0.99]"
      >
        <span className="min-w-0">
          <span className="block font-display text-[19px] font-medium leading-[1.15] text-ink">
            How did it go with {primary.personName}?
          </span>
          <span className="mt-1 block text-[13px] font-medium leading-[1.4] text-ink-soft">
            {primary.title
              ? primary.title
              : "You prepared for this — review how it landed."}
          </span>
        </span>
        <span className="shrink-0 text-[14px] font-bold text-accent-ink">
          Review →
        </span>
      </button>

      {rest.length > 0 && (
        <div className="mt-5">
          <Kicker className="text-accent-ink">Open conversations</Kicker>
          <div className="mt-2.5 space-y-2">
            {rest.map((loop) => (
              <button
                key={loop.threadId}
                type="button"
                onClick={() => resume(loop)}
                className="flex w-full items-center justify-between gap-3 rounded-card border border-hairline bg-surface p-4 text-left transition active:scale-[0.99]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-ink">
                    {loop.personName}
                  </span>
                  {loop.title && (
                    <span className="mt-0.5 block truncate text-[13px] font-medium text-ink-soft">
                      {loop.title}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[13px] font-bold text-accent-ink">
                  Review →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
