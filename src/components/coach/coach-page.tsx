// Pure EQ — generic page renderer for Coach modules under the new
// multi-Q-per-page model (Coach SOT 2026-05-06).
//
// Responsibilities (deliberately narrow):
//   1. Render the page eyebrow + page dots.
//   2. Iterate `page.qs`, hide ones whose `conditional` returns false.
//   3. For each visible Q, render its title + optional prompt, then call
//      consumer-supplied `renderStep(step)` for the input itself.
//   4. Wrap each rendered step in a `<div key={...}>` keyed on
//      `${page.pageKey}.${q.key}` so that on page advance every input
//      (especially VoiceInput / PersonPicker / sensor-holding components)
//      forces a fresh mount. Carries CLAUDE.md "step-based forms must key
//      any mic/camera/sensor-holding component by the current step" forward
//      to the multi-Q model.
//
// What this does NOT do (consumer's job):
//   - Owning `data` state (string-keyed Record<string, unknown>).
//   - Wiring side state (personId, threadId, currentUserId) — `person` and
//     `select` step kinds always require parent-managed adjuncts.
//   - Conditional value cleanup: when a controlling Q's value flips so a
//     dependent Q's `conditional` returns false, the parent must clear the
//     dependent Q's value from `state` to prevent stale data leaking into
//     POST. CoachPage hides; it does not mutate.
//   - Submit / Next / Back nav buttons. The consumer renders those below
//     CoachPage and uses `pageCanAdvance(page, state)` to gate Next.

import type { ReactNode } from "react";
import type { PageDef, StepDef } from "@/lib/coach/page-flow";
import { PageDots } from "./page-dots";

type Props = {
  /** Eyebrow label, e.g. "Prepare", "Review", "Pulse Check". */
  eyebrow: string;
  /** Tailwind classes for the eyebrow chip — color varies per module. */
  eyebrowClassName?: string;
  /** Current page (1-indexed in display, 0-indexed in code). */
  pageIndex: number;
  totalPages: number;
  page: PageDef;
  /** Used to evaluate `q.conditional`. Read-only here. */
  state: Record<string, unknown>;
  /** Render the input for a step. Consumer dispatches on `step.kind`. */
  renderStep: (step: StepDef) => ReactNode;
  /** Optional banner above all Qs (e.g. "From your Pulse Check…"). */
  banner?: ReactNode;
  /**
   * Optional override for the page title displayed above the first Q.
   * Defaults to `page.pageTitle`. Pass null to suppress (some pages render
   * their own header below the eyebrow row, e.g. Pulse Check chip screen).
   */
  pageTitle?: string | null;
};

export function CoachPage({
  eyebrow,
  eyebrowClassName,
  pageIndex,
  totalPages,
  page,
  state,
  renderStep,
  banner,
  pageTitle,
}: Props) {
  const visibleQs = page.qs.filter(
    (q) => !q.conditional || q.conditional(state),
  );
  const titleToShow =
    pageTitle === null ? null : (pageTitle ?? page.pageTitle ?? null);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span
          className={
            eyebrowClassName ??
            "inline-block rounded-pill bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.8px] text-white"
          }
        >
          {eyebrow}
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
          {pageIndex + 1} / {totalPages}
        </p>
      </div>
      <div className="mt-3">
        <PageDots current={pageIndex} total={totalPages} />
      </div>

      {titleToShow && (
        <h2
          className="mt-5 font-display text-[26px] leading-[1.12] text-ink"
          style={{ letterSpacing: "-0.5px" }}
        >
          {titleToShow}
        </h2>
      )}

      {banner && <div className="mt-4">{banner}</div>}

      <div className={titleToShow ? "mt-5 space-y-6" : "mt-5 space-y-6"}>
        {visibleQs.map((q) => (
          <div key={`${page.pageKey}.${q.key}`}>
            <h3
              className="font-display text-[20px] leading-[1.2] text-ink"
              style={{ letterSpacing: "-0.3px" }}
            >
              {q.title}
            </h3>
            {q.prompt && (
              <p className="mt-1.5 text-[13px] font-medium leading-[1.45] text-ink-soft">
                {q.prompt}
              </p>
            )}
            <div className="mt-3">{renderStep(q)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
