"use client";

import { useRouter } from "next/navigation";
import { Kicker } from "@/components/ui/kicker";
import { stashReviewPrefill } from "@/lib/coach/review-prefill";

// ============================================================
// LoopNudge — open-loop return prompts on the hub (Phase 2)
// ============================================================
// Each loop is a conversation the user prepared for but hasn't reviewed yet.
// Tapping stashes a Review prefill (person) and routes into Review — the
// Prepare→Review calibration link forms server-side off the person. Resolved by
// the hub server component; this client wrapper only handles the tap → stash →
// route so sessionStorage + the auth lookup run in the browser.

export type OpenLoop = {
  threadId: string;
  personId: string | null;
  personName: string;
};

export function LoopNudge({ loops }: { loops: OpenLoop[] }) {
  const router = useRouter();
  if (loops.length === 0) return null;

  async function resume(loop: OpenLoop) {
    await stashReviewPrefill({
      personName: loop.personName,
      personId: loop.personId,
      source: "loop_nudge",
    });
    router.push("/coach/review");
  }

  return (
    <div className="mb-5">
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
              <span className="mt-0.5 block text-[13px] font-medium text-ink-soft">
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
