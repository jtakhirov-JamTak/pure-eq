// Pure EQ — Coach calibration helpers (Coach SOT 2026-05-06).
//
// Calibration links a Review back to its most recent Prepare for the same
// person, so the Page-5 calibration block ("How did the conversation
// compare to your forecast?") has a forecast to compare to. The 14-day
// lookback is INTENTIONALLY decoupled from the 7-day thread auto-link
// window in run-module.ts: thread-continuity ("are these the same
// ongoing thread?") and forecast-continuity ("did your prediction hold
// up?") have different time horizons. A Prepare that was the most recent
// 10 days ago should still calibrate, even if the thread closed.
//
// soft-deleted Prepares are excluded — without that filter, a Review
// could `linked_prepare_entry_id` to a row the user hard-deleted from
// their conversations, and downstream renderers would 404.

import { CALIBRATION_LOOKBACK_DAYS } from "./page-flow";
import type { AppSupabase } from "./types";

/**
 * Snapshot of a Prepare row needed for the prompt prepend. Fields land
 * verbatim in the Review prompt's user block before whatHappened, framed
 * as "your forecast was…" so the model can reason about gaps. Kept as a
 * structural type rather than `Database["public"]["Tables"]...["Row"]`
 * so callers don't have to thread the table type through.
 */
export type PrepareSnapshot = {
  prepareEntryId: string;
  createdAt: string;
  situation: string | null;
  emotionAsData: string | null;
  predictedReaction: string | null;
  hiddenExpectation: string | null;
  specificShift: string | null;
  outcomeFloor: string | null;
  opener: string | null;
  // 2026-05-17 fix3 (#20): three new Prepare SOT fields fed into the
  // Review calibration prepend so the model can compare the user's
  // pre-conversation primary emotion / default pattern / planned neutral
  // question against what actually happened.
  primaryEmotion: string | null;
  defaultPattern: string | null;
  neutralCheckQuestion: string | null;
};

/**
 * Find the user's most recent non-deleted Prepare for the given person
 * within the calibration lookback window. Returns null when there's no
 * matching Prepare (no link). Returns null on DB error too — the caller
 * (the Review page on client side, or the prePromptEnrich hook on
 * server side) treats absence-of-link as the standalone branch shape.
 */
export async function findLinkedPrepareEntry(
  supabase: AppSupabase,
  userId: string,
  personId: string,
): Promise<PrepareSnapshot | null> {
  const cutoff = new Date(
    Date.now() - CALIBRATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("prepare_entries")
    .select(
      "prepare_entry_id, created_at, situation_text, emotion_as_data, predicted_reaction, hidden_expectation, specific_shift, outcome_floor, opener, primary_emotion, default_pattern, neutral_check_question",
    )
    .eq("user_id", userId)
    .eq("person_id", personId)
    .is("deleted_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    prepareEntryId: data.prepare_entry_id,
    createdAt: data.created_at,
    situation: data.situation_text,
    emotionAsData: data.emotion_as_data,
    predictedReaction: data.predicted_reaction,
    hiddenExpectation: data.hidden_expectation,
    specificShift: data.specific_shift,
    outcomeFloor: data.outcome_floor,
    opener: data.opener,
    primaryEmotion: data.primary_emotion,
    defaultPattern: data.default_pattern,
    neutralCheckQuestion: data.neutral_check_question,
  };
}
