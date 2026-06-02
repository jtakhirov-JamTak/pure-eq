// ============================================================
// Review prefill handoff (Phase 2 — in-app return loop)
// ============================================================
// The return loop routes a user from a Prepare result / open-loop nudge /
// thread back into Review, pre-selecting the person they prepared for. The
// Prepare→Review calibration link is keyed entirely off the person server-side
// (review route prePromptEnrich → findLinkedPrepareEntry(userId, personId), and
// threadBehavior:"auto_link" attaches the thread), so the only thing the client
// must carry is the person. personId is best-effort — Review re-resolves the
// person by name (personDedup:"name_only") when it's null (e.g. a brand-new
// Prepare person whose row is created server-side).
//
// Same cross-account guard as the BYS prefill: sessionStorage is tab-scoped, not
// account-scoped, so the reader validates BOTH a 5-minute freshness window and
// that the stashed userId matches the current Supabase session before it
// populates anything.

import { createClient } from "@/lib/supabase/client";

export const REVIEW_PREFILL_KEY = "pure-eq:review-prefill";
export const REVIEW_PREFILL_MAX_AGE_MS = 5 * 60 * 1000;

export type ReviewPrefillSource = "prepare_followup" | "loop_nudge" | "thread";

export type ReviewPrefill = {
  personName?: string;
  personId?: string | null;
  // Why we routed here — drives the banner copy on the Review person step.
  source?: ReviewPrefillSource;
  userId?: string;
  stashedAt?: number;
};

// Stamp the current user's id + a timestamp and stash. Self-contained (resolves
// userId itself) so every call site doesn't have to thread it through. Failure
// is non-fatal — Review simply starts empty.
export async function stashReviewPrefill(p: {
  personName: string;
  personId: string | null;
  source: ReviewPrefillSource;
}): Promise<void> {
  try {
    const { data } = await createClient().auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    const payload: ReviewPrefill = {
      personName: p.personName,
      personId: p.personId,
      source: p.source,
      userId,
      stashedAt: Date.now(),
    };
    sessionStorage.setItem(REVIEW_PREFILL_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage / auth failure is non-fatal — Review will start empty.
  }
}
