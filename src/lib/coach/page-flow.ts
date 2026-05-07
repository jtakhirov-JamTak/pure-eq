// Pure EQ — Coach pagination foundation (Coach SOT 2026-05-06).
//
// Replaces the single-Q-per-step model with multi-Q-per-page. Each Coach
// module declares a `PageDef[]`; each PageDef has 1+ StepDef Qs that share
// a screen. This file defines the shapes + the `pageCanAdvance` validator
// the page renderer uses to decide if the user can move forward.
//
// Two load-bearing rules carried over from CLAUDE.md:
//   1. VoiceInput / PersonPicker / sensor-holding components must remount
//      across page advance — the renderer keys each by `${pageKey}.${qKey}`
//      so a stale async transcript can't fire into the wrong field.
//   2. Conditional Qs (`q.conditional`) must have their state value cleared
//      when the condition flips false — otherwise a hidden Q's value leaks
//      into POST. `pageCanAdvance` ignores hidden Qs; the page-level state
//      cleanup is the renderer's job.

/**
 * Calibration lookback window for Review → most-recent Prepare linkage.
 * Decoupled from the 7-day thread auto-link window by design — calibration
 * concerns "did your forecast match reality?" which can outlast thread
 * continuity. Configurable; bump if 14d proves too short / long.
 */
export const CALIBRATION_LOOKBACK_DAYS = 14;

/**
 * Review needs_to_happen_next chips that trigger the Repair branch on
 * Full Review. Quick Review does NOT trigger Repair even on these chips.
 * Centralized here so client (page) and server (route) agree without
 * a stringly-typed `if` chain in two files.
 */
export const REPAIR_TRIGGER_NEEDS = [
  "clarify",
  "apologize",
  "reassure",
  "ask_for_repair",
] as const;

export type RepairTriggerNeed = (typeof REPAIR_TRIGGER_NEEDS)[number];

export type StepKind =
  | "person"
  | "select"
  | "textarea"
  | "textarea_with_body_chip"
  | "textarea_two_column"
  | "textarea_three_field_lesson"
  | "textarea_if_then"
  | "select_signal_next_move"
  | "select_repair_need"
  | "select_protecting_with_optional_text"
  | "select_needs_with_forecast"
  | "timing_combo"
  | "select_calibration_chip";

export type StepDef = {
  key: string;
  title: string;
  prompt: string | null;
  kind: StepKind;
  /**
   * Optional predicate: if returns false, the Q is hidden on the page.
   * The page renderer must also clear `state[q.key]` when this flips
   * from true → false to prevent stale data leaking into POST.
   */
  conditional?: (state: Record<string, unknown>) => boolean;
};

export type PageDef = {
  pageKey: string;
  pageTitle?: string;
  qs: StepDef[];
};

/**
 * Returns true if every visible Q on the page has a non-empty value in
 * `state`. Hidden Qs (conditional?.(state) === false) are skipped.
 *
 * "Non-empty" is intentionally loose — `string` is trimmed and checked
 * for length > 0; arrays/objects/numbers/booleans are checked for any
 * truthy presence (covers chip selections, body location, timing combos).
 */
export function pageCanAdvance(
  page: PageDef,
  state: Record<string, unknown>,
): boolean {
  for (const q of page.qs) {
    if (q.conditional && !q.conditional(state)) continue;
    const v = state[q.key];
    if (v == null) return false;
    if (typeof v === "string" && v.trim().length === 0) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (typeof v === "object" && !Array.isArray(v)) {
      // Object kinds (timing_combo etc.) require all leaf string fields
      // to be non-empty. Objects use a flat shape — { when: string,
      // isNowThatMoment: boolean }; require `when` to be non-empty if
      // present, ignore booleans.
      const obj = v as Record<string, unknown>;
      let hasAny = false;
      for (const key of Object.keys(obj)) {
        const child = obj[key];
        if (typeof child === "string") {
          if (child.trim().length === 0) return false;
          hasAny = true;
        } else if (typeof child === "boolean") {
          hasAny = true;
        } else if (child != null) {
          hasAny = true;
        }
      }
      if (!hasAny) return false;
    }
  }
  return true;
}
