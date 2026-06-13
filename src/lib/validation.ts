// Pure EQ domain — replace in fork.
import { z } from "zod";
import {
  CONVERSATION_MOVES,
  REVIEW_NEXT_MOVE_VALUES,
  PULSE_NEXT_MOVE_V2_VALUES,
  CHECK_WINDOW_VALUES,
} from "@/types";

// Onboarding
export const quizAnswerSchema = z.object({
  questionIndex: z.number().int().min(0).max(8),
  selectedOption: z.enum(["A", "B", "C", "D", "E"]),
});

// Per-question option allowlist. Q9 (forecast) only renders A/B/C in the UI;
// the broader A|B|C|D|E enum stays on quizAnswerSchema for back-compat with
// stored payloads, but the API rejects D/E on Q9 so the audit trail in
// payload_json never references an option the question_snapshot lacks.
const Q9_ALLOWED = new Set(["A", "B", "C"]);

export const submitQuizSchema = z
  .object({
    answers: z.array(quizAnswerSchema).length(9),
  })
  .refine(
    (data) => {
      const indices = data.answers.map((a) => a.questionIndex);
      const unique = new Set(indices);
      if (unique.size !== 9) return false;
      for (let i = 0; i < 9; i++) if (!unique.has(i)) return false;
      return true;
    },
    { message: "answers must cover each questionIndex 0-8 exactly once" }
  )
  .refine(
    (data) => {
      const q9 = data.answers.find((a) => a.questionIndex === 8);
      return !q9 || Q9_ALLOWED.has(q9.selectedOption);
    },
    { message: "Q9 forecast must be A, B, or C" }
  );

// ============================================================
// Coach SOT 2026-05-06 — shared enum tuples.
// ============================================================
// Tuples exported as const so step components, prompts, schemas, and
// (eventually) Insights aggregator all derive from one source. Adding a
// new value here propagates to all consumers; drift fails the build.
// Defined ABOVE the schemas that consume them so the file reads top-to-
// bottom without forward references.

// 5 condensed domains (migration 0052). See RelationshipDomain in @/types.
// Single source for both the Prepare schema and createPersonSchema.
const RELATIONSHIP_ENUM = z.enum([
  "romantic", "friend", "family", "work", "other",
]);

/**
 * Body location values for Prepare + Review (8 chips).
 * Pulse Check uses BODY_LOCATION_PULSE_VALUES (this set + `fuzzy_cant_tell`).
 * The fuzzy chip is intentionally NOT available outside Pulse Check —
 * Insights aggregator never sees `fuzzy_cant_tell` from non-pulse rows.
 */
export const BODY_LOCATION_VALUES = [
  "throat",
  "chest",
  "stomach",
  "jaw",
  "shoulders",
  "face",
  "other",
  "dont_notice",
] as const;

/**
 * Pulse Check body locations (8 base + fuzzy_cant_tell).
 * `fuzzy_cant_tell` is the "I can't quite tell where it is" escape hatch
 * specific to the Pulse Check use case (early-detection, often pre-verbal).
 */
export const BODY_LOCATION_PULSE_VALUES = [
  ...BODY_LOCATION_VALUES,
  "fuzzy_cant_tell",
] as const;

/**
 * Pulse Check next-move chip (7 values). Determines the result-screen
 * routing matrix: wait_observe → close, regulate_first → /tools/overwhelmed,
 * ask_clarifying → BYS, prepare_conversation → /coach/prepare,
 * use_bys → /coach/before-send, review → /coach/review, do_nothing → close.
 */
export const PULSE_NEXT_MOVE_VALUES = [
  "wait_observe",
  "regulate_first",
  "ask_clarifying",
  "prepare_conversation",
  "use_bys",
  "review",
  "do_nothing",
] as const;

/**
 * Review "what was I protecting?" chip (9 values). Optional one-line
 * companion text in `whatProtectingText`.
 */
export const WHAT_PROTECTING_VALUES = [
  "status",
  "safety",
  "image",
  "relationship",
  "time",
  "boundaries",
  "being_right",
  "not_feeling_stupid",
  "other",
] as const;

/**
 * Review Repair "what they need first" chip (5 values). Drives both the
 * Repair branch field and the AI's `recommended_timing` derivation.
 */
export const THEIR_NEED_FIRST_VALUES = [
  "acknowledgment",
  "clarity",
  "safety",
  "space",
  "boundary",
] as const;

/**
 * Review calibration chip taxonomy (3 sub-enums). SOT 2026-05-08 — the
 * Prepare → Review prediction loop. Each sub-enum scores one dimension
 * of "did the forecast match reality?":
 *   compare — was the conversation better/about_right/worse than predicted?
 *   shift   — did the specific shift you asked for actually happen?
 *   floor   — did you hit the good-enough outcome you set?
 * Promoted from `SelectCalibrationChip` component (fix2). Schema now
 * enforces the enums server-side so a direct API caller can't post
 * arbitrary 40-char strings into `review_entries.calibration_block`.
 */
export const CALIBRATION_COMPARE_VALUES = [
  "better",
  "about_right",
  "worse",
] as const;
export const CALIBRATION_SHIFT_VALUES = [
  "yes",
  "partial",
  "no",
  "too_soon",
] as const;
export const CALIBRATION_FLOOR_VALUES = ["yes", "mostly", "no"] as const;

// ============================================================
// Coach — Prepare (Coach SOT 2026-05-06)
// ============================================================
// Single flat 14-field schema. Replaces the 2026-04-23 Path A/B split:
// the locked SOT cross-eval batch determined that Pulse Check ("something
// feels off") deserves its own module + table; Prepare is now exclusively
// "I need to have a conversation". The 14 SOT fields land across 5 pages:
//   1. personName, relationship                    (2)
//   2. situation, emotionAsData                    (2)
//   3. observedFromThem, theirStateHedged,
//      fairestVersion                              (3 — three-field lesson UI)
//   4. predictedReaction, hiddenExpectation,
//      specificShift, outcomeFloor                 (4)
//   5. opener + bodyLocation, triggerPlan          (2 fields, 2 step rows)
//
// Old fields (situation_text/primary_value/their_need/etc.) stay nullable
// in the DB for export reads on legacy rows; new posts do not send them.

// Coins redesign (Slice A, 2026-05-29): lean 8-field Prepare. The old
// 16-field SOT flow is replaced by 8 fields + a Quick/Deep tier selector.
// Fields the lean form no longer collects (primaryEmotion+body, emotionAsData,
// defaultPattern, observedFromThem, theirStateHedged, predictedReaction,
// hiddenExpectation, specificShift, outcomeFloor, neutralCheckQuestion) keep
// their columns nullable for legacy export reads — new posts simply stop
// sending them. Two formerly-user inputs move:
//   - predictedReaction → now an AI Quick card (writes predicted_reaction
//     via extractDerivedFromAi); no longer a form field.
//   - hiddenExpectation + outcomeFloor → merged into hiddenAskAndFloor
//     (new column hidden_ask_and_floor, migration 0040).
// New: conversationMove (routing chip, column conversation_move) + tier.
// Pages: 1) personName, relationship, conversationMove
//        2) situation, fairestVersion
//        3) hiddenAskAndFloor, opener, triggerPlan
export const createPrepareSchema = z.object({
  // Quick = 3 AI cards (lower coin cost), Deep = 5. Persisted to ai_tier.
  tier: z.enum(["quick", "deep"]).default("quick"),
  personName: z.string().trim().min(1).max(200),
  relationship: RELATIONSHIP_ENUM,
  conversationMove: z.enum(CONVERSATION_MOVES),
  situation: z.string().trim().min(1).max(5000),
  fairestVersion: z.string().trim().min(1).max(2000),
  hiddenAskAndFloor: z.string().trim().min(1).max(2000),
  opener: z.string().trim().min(1).max(1000),
  triggerPlan: z.string().trim().min(1).max(2000),
  // Person/thread + idempotency. idempotencyKey is injected by route layer.
  personId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

// ============================================================
// Coach — Review (Coach redesign 2026-04-23: new fields + repair branch)
// ============================================================
// New base fields replace the old (whatHelped/whatHurt/validatedAssumptions/
// unresolvedAndNext are dropped; the redesigned form does not collect them).
// Repair branch fields are optional — populated only when readiness gate
// yields yes/somewhat AND needs_to_happen_next ∈ {apologize, reassure,
// clarify, ask_for_repair}.

// Enum tuples exported as const so Insights aggregator, FIELD GLOSSARY prompt
// block, and Zod schema all derive from a single source. Adding a new value
// here propagates to all three consumers; drift fails the build.
export const REVIEW_NEEDS_NEXT_VALUES = [
  "nothing",
  "clarify",
  "align",
  "apologize",
  "reassure",
  "give_space",
  "set_boundary",
  "ask_for_repair",
] as const;

export const BEFORE_YOU_SEND_MESSAGE_TYPE_VALUES = [
  "conflict",
  "check_in",
  "apology",
  "repair",
  "ask",
  "boundary",
  "other",
] as const;

// Coins redesign (Slice A + C3, 2026-05-29): lean 7-field Review. The old
// Quick/Full split + page-5 calibration chips + in-form Repair branch are
// replaced by ONE lean form plus a Quick/Deep AI-tier selector — form depth is
// decoupled from AI tier. Dropped inputs (reviewDepth, hardestMomentFeeling,
// the 8 Full SOT Qs, body chip, lessonScreen, whatProtecting, calibrationBlock,
// needsToHappenNext, forecast, the 6 repair fields) keep their columns nullable
// for legacy export reads; new posts simply stop sending them. Two formerly-
// multi inputs merge:
//   - lessonScreen + treatAsData → dataAndUpdate (column data_and_update).
//   - needsToHappenNext → nextMove (lean taxonomy, column next_move).
// The Prepare→Review calibration link is UNCHANGED: the route still resolves
// the linked Prepare server-side (prePromptEnrich) and feeds predicted_reaction
// into the prompt; only the user-facing calibration chips are gone. Repair is no
// longer an in-form branch — `nextMove: "repair"` records intent for the future
// standalone Repair module (Slice D).
// Pages: 1) personName, whatHappened
//        2) observedRaw + interpretedRaw (two-column), whatYouDid
//        3) easierOrHarder, dataAndUpdate, nextMove
export const createReviewSchema = z.object({
  // Quick = 3 AI cards (lower coin cost), Deep = 5. Persisted to ai_tier.
  tier: z.enum(["quick", "deep"]).default("quick"),
  personName: z.string().trim().min(1).max(200),
  whatHappened: z.string().trim().min(1).max(5000),
  // Two-column observed-vs-interpreted step (one form step, two sub-fields).
  observedRaw: z.string().trim().min(1).max(2000),
  interpretedRaw: z.string().trim().min(1).max(2000),
  whatYouDid: z.string().trim().min(1).max(5000),
  easierOrHarder: z.string().trim().min(1).max(5000),
  // Merged: what this interaction taught you + what should change next time.
  dataAndUpdate: z.string().trim().min(1).max(5000),
  nextMove: z.enum(REVIEW_NEXT_MOVE_VALUES),
  // Server-authoritative (prePromptEnrich overrides). Kept so buildDerivedInsert
  // can persist the resolved link; the route forces it to null when no linked
  // Prepare snapshot is found, so a client can't smuggle a foreign FK.
  linkedPrepareEntryId: z.string().uuid().nullable().optional(),
  // Person/thread.
  personId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

// ============================================================
// Coach — Before You Send (NEW Coach redesign 2026-04-23)
// ============================================================
export const createBeforeYouSendSchema = z.object({
  // Lean 3-question redesign (Phase 1, 2026-06-01). BYS is single-tier — always
  // Quick (4 coins). `tier` is clamped to "quick" server-side so a client that
  // posts tier:"deep" is still charged the flat Quick cost; the field is kept
  // (not dropped) because run-module derives the coin cost from input.tier.
  tier: z
    .enum(["quick", "deep"])
    .optional()
    .transform(() => "quick" as const),
  // Three required inputs, one per screen. situationFacts + desiredOutcome are
  // new (persisted to situation_facts / desired_outcome, migration 0045).
  situationFacts: z.string().trim().min(1).max(5000),
  desiredOutcome: z.string().trim().min(1).max(5000),
  draftText: z.string().trim().min(1).max(10000),
  // message_type is no longer a user input — the model infers it. Kept in the
  // data model (default "conflict", a valid value in the 7-value CHECK) so the
  // column stays satisfied and the Pulse/Review prefill handoffs may still send
  // their own value. Never surfaced in the UI.
  messageType: z.enum(BEFORE_YOU_SEND_MESSAGE_TYPE_VALUES).default("conflict"),
  // BYS has no person/thread concept; runCoachModule's personBehavior:"skip"
  // + threadBehavior:"none" config skips those resolution steps.
});

/**
 * Pulse Check Zod schema — lean redesign (Slice C1, coins redesign 2026-05-29).
 *
 * Trims the old 10-field "Something feels off" worksheet to 6 visible + 2
 * conditional fields. Drops `relationship` (resolved server-side from the
 * person row, like lean Review), `whenItShifted`, `feelingAndBody`, and
 * `theirsNotAboutYou` (their columns stay nullable for legacy export).
 * The single-sided `signalNoiseObservation` becomes the two-sided
 * `signalTestConfirm` + `signalTestDisconfirm` falsifiable test. `nextMoveChip`
 * (legacy 7) is replaced by the leaner `nextMove` taxonomy (PULSE_NEXT_MOVE_V2).
 *
 * Two conditional fields, enforced via `.superRefine` so wrong-shape posts fail
 * at the API boundary, not the step renderer:
 *   - `checkWindow` is required when `nextMove === "observe"` (how long to watch
 *     before re-checking).
 *   - `lightCheckQuestion` is required when `nextMove === "ask_light"` (the
 *     one-line check-in the user pre-drafts on the same screen).
 * Mirrors createReviewSchema (tier, personId/threadId nullable, idempotencyKey
 * injected by the runner config).
 */
export const createPulseCheckSchema = z
  .object({
    // Quick = 3 AI cards (lower coin cost), Deep = 5. Persisted to ai_tier.
    tier: z.enum(["quick", "deep"]).default("quick"),
    personName: z.string().trim().min(1).max(200),
    whatFeelsOff: z.string().trim().min(1).max(2000),
    whatChangedVsBefore: z.string().trim().min(1).max(2000),
    storyAndAlternative: z.object({
      story: z.string().trim().min(1).max(2000),
      alternative: z.string().trim().min(1).max(2000),
    }),
    // Two-sided falsifiable test (3–7 day window) — replaces the single-sided
    // signalNoiseObservation.
    signalTestConfirm: z.string().trim().min(1).max(1000),
    signalTestDisconfirm: z.string().trim().min(1).max(1000),
    nextMove: z.enum(PULSE_NEXT_MOVE_V2_VALUES),
    // Conditional — required only for the move noted in the superRefine below.
    checkWindow: z.enum(CHECK_WINDOW_VALUES).nullable().optional(),
    lightCheckQuestion: z.string().max(2000).nullable().optional(),
    personId: z.string().uuid().nullable().optional(),
    threadId: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.nextMove === "observe") {
      const hasWindow = typeof data.checkWindow === "string";
      if (!hasWindow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "checkWindow required when nextMove is observe",
          path: ["checkWindow"],
        });
      }
    }
    if (data.nextMove === "ask_light") {
      const hasQuestion =
        typeof data.lightCheckQuestion === "string" &&
        data.lightCheckQuestion.trim().length > 0;
      if (!hasQuestion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "lightCheckQuestion required when nextMove is ask_light",
          path: ["lightCheckQuestion"],
        });
      }
    }
  });

/**
 * Review calibration block (3 chips, jsonb in DB). Stored as a structured
 * object; chip values are constrained to the SOT enums (fix2 — promoted
 * from the component to enforce server-side). Each sub-enum scores a
 * single forecast-vs-reality dimension.
 */
export const calibrationBlockSchema = z.object({
  compare: z.enum(CALIBRATION_COMPARE_VALUES),
  shift: z.enum(CALIBRATION_SHIFT_VALUES),
  floor: z.enum(CALIBRATION_FLOOR_VALUES),
});

// Tools after_feeling: must mirror the DB CHECK in
// 0033_restore_tools_tables.sql (overwhelmed_entries_after_feeling_check
// + trigger_entries_after_feeling_check). Loose z.string() Zod let
// off-list values pass and 23514 at insert time, surfacing as a generic
// 500. Enum here gives a clean 400.
export const TOOLS_AFTER_FEELING_VALUES = [
  "Calmer",
  "Lighter",
  "Hopeful",
  "Relieved",
  "Energized",
  "Same",
] as const;

// Optional "who was this about?" person link, shared by both tools (founder
// direction 2026-06-12; BYS deliberately excluded — it has no person concept).
// personId = picked an existing person; personName = typed a new name (the
// route dedups/creates server-side, same as the coach modules).
const toolsPersonFields = {
  personId: z.string().uuid().nullable().optional(),
  personName: z.string().trim().max(200).nullable().optional(),
};

// Tools — Overwhelmed
export const createOverwhelmedSchema = z.object({
  beforeRating: z.number().int().min(1).max(5),
  bodyLocation: z.string().max(200).nullable().optional(),
  feelingLabel: z.string().trim().min(1).max(5000),
  afterRating: z.number().int().min(1).max(5),
  afterFeeling: z.enum(TOOLS_AFTER_FEELING_VALUES),
  ...toolsPersonFields,
});

// Tools — Trigger Log
export const createTriggerSchema = z.object({
  trigger: z.string().trim().min(1).max(5000),
  interpretation: z.string().trim().min(1).max(5000),
  emotion: z.string().trim().min(1).max(1000),
  emotionIntensity: z.number().int().min(1).max(10),
  urge: z.string().trim().min(1).max(1000),
  urgeIntensity: z.number().int().min(1).max(10),
  behavior: z.string().trim().min(1).max(5000),
  outcome: z.string().trim().min(1).max(5000),
  reflection: z.string().trim().min(1).max(5000),
  afterFeeling: z.enum(TOOLS_AFTER_FEELING_VALUES),
  ...toolsPersonFields,
});

// Persons
export const createPersonSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  relationshipDomain: RELATIONSHIP_ENUM,
  relationshipSubtype: z.string().max(200).nullable().optional(),
});

// Account deletion — irreversible hard delete. The literal "DELETE" must be
// typed to confirm; the schema enforces it server-side so a malformed/automated
// POST without the exact confirmation word is rejected before any delete runs.
export const deleteAccountSchema = z.object({
  confirm: z.literal("DELETE"),
});

// Coins purchase — Stripe one-time checkout (Slice B2). `pack` is one of the
// founder-final coin packs; the server maps it to a Stripe Price ID.
export const checkoutSchema = z.object({
  pack: z.enum(["booster", "starter", "builder", "master"]),
});

// Outcome tracking — Review
export const immediateOutcomeSchema = z.object({
  movedForward: z.enum(["yes", "partly", "no", "unclear"]),
  theySeemUnderstood: z.enum(["more", "same", "less", "unclear"]),
  usedPreparePlan: z.enum(["yes", "partly", "no", "no_prepare"]),
  reviewEntryId: z.string().uuid(),
});

// Outcome tracking — Repair (legacy archive only).
// /coach/repair top-level page is deleted, but the outcome PATCH endpoint
// stays so users can still mark outcomes on archived repair_entries rows
// surfaced in the data export. New repair flow lives inside Review.
export const repairOutcomeSchema = z.object({
  attemptedRepair: z.enum(["yes", "planned", "no"]),
  howReceived: z.enum(["positive", "mixed", "negative", "no_response", "too_early"]),
  understandingImproved: z.enum(["yes", "partly", "no", "unclear"]),
  repairEntryId: z.string().uuid(),
});
