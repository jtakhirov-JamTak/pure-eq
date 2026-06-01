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

/**
 * Server- and client-shared derivation of repair-branch activation.
 * Lifted here from `src/app/api/coach/review/route.ts` (2026-05-17 fix3
 * #14) so the page-renderer and the API handler can't drift when the
 * trigger chip set or depth rules change. The server still treats the
 * client-posted `repairBranchActive` flag as a hint only — it re-runs
 * this function over the parsed payload and null-stamps repair columns
 * if the derived value is false.
 */
export function deriveRepairBranchActive(input: {
  reviewDepth?: "quick" | "full" | null;
  needsToHappenNext?: string | null;
}): boolean {
  if (input.reviewDepth !== "full") return false;
  const chip = input.needsToHappenNext;
  if (!chip) return false;
  return (REPAIR_TRIGGER_NEEDS as readonly string[]).includes(chip);
}

export type StepKind =
  | "person"
  | "select"
  | "select_conversation_move"
  | "select_review_next_move"
  | "textarea"
  | "textarea_with_body_chip"
  | "textarea_two_column"
  | "textarea_three_field_lesson"
  | "textarea_if_then"
  | "select_signal_next_move"
  | "select_pulse_next_move"
  | "select_check_window"
  | "select_repair_need"
  | "select_protecting_with_optional_text"
  | "select_needs_with_forecast"
  | "timing_combo"
  | "select_calibration_chip";

/**
 * Calibration chip set selector — picks which of the 3 SOT chip groups
 * a `select_calibration_chip` step renders. Each instance renders ONE
 * chip row + the SOT enums for that row. Page-5-calibration on Full
 * Review uses three separate StepDefs (compare/shift/floor) so each Q
 * gets its own title + prompt, and the submit handler combines the three
 * string state values into `calibration_block: { compare, shift, floor }`.
 */
export type CalibrationChipSet = "compare" | "shift" | "floor";

export type StepDef = {
  key: string;
  title: string;
  prompt: string | null;
  kind: StepKind;
  /**
   * Required when `kind === "select_calibration_chip"`; ignored otherwise.
   */
  chipSet?: CalibrationChipSet;
  /**
   * Optional row count for `kind === "textarea"` steps. Defaults to 4 in
   * the renderer when omitted. Lowering it to 2 keeps "moment estimate"
   * Qs from inflating the page scroll height on mobile (2026-05-17 fix3
   * #16 — Pulse Check Page 1 density).
   */
  rows?: number;
  /**
   * For object-valued steps (e.g. textarea_three_field_lesson), names the
   * sub-fields that MUST be non-empty for advance. Other sub-fields are
   * ignored (may be missing, null, or empty). If undefined, the default
   * object check applies (every present sub-field must be non-empty —
   * legacy behavior used by timing_combo and the text+body chip composite).
   * SOT 2026-05-08 fix5 (#12) generalizes the hardcoded
   * `kind === "textarea_three_field_lesson"` special-case previously in
   * pageCanAdvance.
   */
  requiredSubFields?: readonly string[];
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
 * Returns true if a SINGLE Q is satisfied in `state`. A hidden Q
 * (conditional?.(state) === false) is vacuously satisfied — it's skipped, not
 * blocking. This is the per-question gate the one-question-per-screen flows use
 * to enable Next; `pageCanAdvance` is the page-level fold over it.
 *
 * "Non-empty" is intentionally loose — `string` is trimmed and checked for
 * length > 0; arrays/objects/numbers/booleans are checked for any truthy
 * presence (covers chip selections, body location, timing combos).
 */
export function questionCanAdvance(
  q: StepDef,
  state: Record<string, unknown>,
): boolean {
  if (q.conditional && !q.conditional(state)) return true;
  const v = state[q.key];
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // SOT 2026-05-08 fix5 (#12): when requiredSubFields is declared, ONLY
    // those keys must be non-empty. Everything else is ignored. Used by
    // lessonScreen ({ a: required, b: optional, c: optional }).
    if (q.requiredSubFields !== undefined) {
      for (const key of q.requiredSubFields) {
        const child = obj[key];
        if (typeof child === "string") {
          if (child.trim().length === 0) return false;
        } else if (typeof child === "boolean") {
          // booleans count as present.
        } else if (child == null) {
          return false;
        }
      }
      return true;
    }
    // Default: every present sub-field must be non-empty AND the object
    // must have at least one non-empty value. Used by timing_combo
    // ({ when: string, isNowThatMoment: boolean }) and the
    // textarea_with_body_chip composite ({ text, bodyLocation }).
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
    return hasAny;
  }
  // number / boolean present → satisfied.
  return true;
}

/**
 * Returns true if every visible Q on the page is satisfied. Hidden Qs are
 * skipped. Fold of `questionCanAdvance` over the page.
 */
export function pageCanAdvance(
  page: PageDef,
  state: Record<string, unknown>,
): boolean {
  return page.qs.every((q) => questionCanAdvance(q, state));
}

/**
 * One flattened, currently-visible question in a one-question-per-screen flow,
 * tagged with the section (page) it belongs to so the progress dots can track
 * the ORIGINAL grouping (redesign §5).
 */
export type FlatStep = {
  q: StepDef;
  /** Section index = the page this Q came from. Drives the progress dots. */
  sectionIndex: number;
  pageKey: string;
};

/**
 * Flatten a `PageDef[]` into the ordered sequence of currently-VISIBLE
 * questions, one per screen. Recomputed from `state` each call, so a
 * conditional Q that becomes visible/hidden enters/leaves the sequence
 * automatically. Callers track an index into this list and must clamp it when
 * the length shrinks (a prior answer hid a later Q).
 */
export function flattenVisibleSteps(
  pages: PageDef[],
  state: Record<string, unknown>,
): FlatStep[] {
  const out: FlatStep[] = [];
  pages.forEach((page, sectionIndex) => {
    for (const q of page.qs) {
      if (q.conditional && !q.conditional(state)) continue;
      out.push({ q, sectionIndex, pageKey: page.pageKey });
    }
  });
  return out;
}
