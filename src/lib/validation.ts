// Pure EQ domain — replace in fork.
import { z } from "zod";

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
// Coach — Prepare (Coach redesign 2026-04-23: 2 entry paths)
// ============================================================
// Path A — "I need to have a conversation" (9 user-fillable fields).
// Path B — "Something feels off" (7 user-fillable fields).
// Both paths share person picker + relationship + idempotencyKey + thread.
// Discriminated by `path` field; routes pick a config per path.

const RELATIONSHIP_ENUM = z.enum([
  "partner", "friend", "family", "manager",
  "direct_report", "coworker", "client", "other",
]);

export const prepareSchemaPathA = z.object({
  path: z.literal("path_a"),
  personName: z.string().trim().min(1).max(200),
  relationship: RELATIONSHIP_ENUM,
  situation: z.string().min(1).max(5000),
  primaryEmotion: z.string().min(1).max(1000),
  defaultPattern: z.string().min(1).max(5000),
  otherPersonHypothesis: z.string().min(1).max(5000),
  theirNeed: z.string().min(1).max(5000),
  realityCheckQuestion: z.string().min(1).max(5000),
  howToMakeThemFeel: z.string().min(1).max(5000),
  triggerPlan: z.string().min(1).max(5000),
  personId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

export const prepareSchemaPathB = z.object({
  path: z.literal("path_b"),
  personName: z.string().trim().min(1).max(200),
  relationship: RELATIONSHIP_ENUM,
  whatFeelsOff: z.string().min(1).max(5000),
  whatChanged: z.string().min(1).max(5000),
  storyTellingYourself: z.string().min(1).max(5000),
  afraidItMeans: z.string().min(1).max(5000),
  // Cross-eval batch #1 (2026-05-03): the 3–7 day signal/noise observation
  // sits between afraidItMeans and realityCheckQuestion. The user names
  // their own falsifiable observation before the AI's best_next_move
  // lands, so a follow-up review can distinguish signal from rumination.
  // Tighter cap (1000) because a falsifiable observation should be
  // specific, not an essay.
  signalNoiseObservation: z.string().min(1).max(1000),
  realityCheckQuestion: z.string().min(1).max(5000),
  triggerPlan: z.string().min(1).max(5000),
  personId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

export const createPrepareSchema = z.discriminatedUnion("path", [
  prepareSchemaPathA,
  prepareSchemaPathB,
]);

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

export const createReviewSchema = z.object({
  // Base fields (always required by the new form).
  whatHappened: z.string().min(1).max(5000),
  // Cross-eval batch #1 (2026-05-03): two-column observed/interpreted step.
  // The form-factor itself trains the split — left column is facts, right
  // column is meaning-making. 2000 cap (vs 5000 elsewhere) is deliberate
  // for the compact two-column UX.
  observedRaw: z.string().min(1).max(2000),
  interpretedRaw: z.string().min(1).max(2000),
  hardestMomentFeeling: z.string().min(1).max(5000),
  whatYouDid: z.string().min(1).max(5000),
  observedInThem: z.string().min(1).max(5000),
  theirExperience: z.string().min(1).max(5000),
  whatYouAvoided: z.string().min(1).max(5000),
  askBeforeUnderstanding: z.enum(["yes", "no", "unclear"]),
  needsToHappenNext: z.enum(REVIEW_NEEDS_NEXT_VALUES),
  // Repair-branch fields (optional — populated only on repair flow).
  repairBranchActive: z.boolean().default(false),
  yourPart: z.string().min(1).max(5000).nullable().optional(),
  // Deprecated 2026-05-03 per cross-eval batch #1; field retained for
  // historical reads only. New form does not collect; new posts send null.
  // Both Qs trained projection of the other person's emotional state
  // rather than honest repair — highest backfire risk for anxious /
  // defensive / Tier 2 user-classes. SOT replacements (pressure-vs-care,
  // distress-tolerance) are a separate ticket.
  secretWant: z.string().min(1).max(5000).nullable().optional(),
  // Deprecated 2026-05-03 per cross-eval batch #1; field retained for
  // historical reads only. New form does not collect; new posts send null.
  couldMakeThemFeel: z.string().min(1).max(5000).nullable().optional(),
  // Person/thread.
  personId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

// ============================================================
// Coach — Before You Send (NEW Coach redesign 2026-04-23)
// ============================================================
export const createBeforeYouSendSchema = z.object({
  draftText: z.string().trim().min(1).max(10000),
  messageType: z.enum(BEFORE_YOU_SEND_MESSAGE_TYPE_VALUES),
  intentOptional: z.string().max(5000).nullable().optional(),
  // Coach SOT 2026-05-06: optional risk-context field above the draft.
  // Surfaces "what might make this land badly" so BYS can flag specific
  // risk patterns (pressure, blame, projection). Empty allowed.
  riskContext: z.string().max(2000).nullable().optional(),
  // BYS has no person/thread concept; runCoachModule's personBehavior:"skip"
  // + threadBehavior:"none" config skips those resolution steps.
});

// ============================================================
// Coach SOT 2026-05-06 — enum tuples + Pulse Check schema.
// ============================================================
// Tuples exported as const so step components, prompts, schemas, and
// (eventually) Insights aggregator all derive from one source. Adding a
// new value here propagates to all consumers; drift fails the build.

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
 * Pulse Check Zod schema. Mirrors the createReviewSchema shape
 * (personId/threadId nullable, idempotencyKey injected by runner config).
 *
 * `lightCheckQuestion` is required when `nextMoveChip ∈ {ask_clarifying,
 * use_bys}` and forbidden otherwise — those two chips lead to a follow-up
 * question that the user pre-drafts on the same screen. Enforced via
 * `.refine` so wrong-shape posts fail at the API boundary, not at the
 * step renderer.
 */
export const createPulseCheckSchema = z
  .object({
    personName: z.string().trim().min(1).max(200),
    relationship: RELATIONSHIP_ENUM,
    whatFeelsOff: z.string().min(1).max(2000),
    whatChangedAndBefore: z.string().min(1).max(2000),
    whenItShifted: z.string().min(1).max(2000),
    feelingAndBody: z.object({
      text: z.string().min(1).max(2000),
      bodyLocation: z.enum(BODY_LOCATION_PULSE_VALUES),
    }),
    theirsNotAboutYou: z.string().min(1).max(2000),
    storyAndAlternative: z.object({
      story: z.string().min(1).max(2000),
      alternative: z.string().min(1).max(2000),
    }),
    signalNoiseObservation: z.string().min(1).max(1000),
    nextMoveChip: z.enum(PULSE_NEXT_MOVE_VALUES),
    lightCheckQuestion: z.string().max(2000).nullable().optional(),
    personId: z.string().uuid().nullable().optional(),
    threadId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) => {
      const requires = data.nextMoveChip === "ask_clarifying" || data.nextMoveChip === "use_bys";
      const has = typeof data.lightCheckQuestion === "string" && data.lightCheckQuestion.trim().length > 0;
      return requires ? has : true;
    },
    {
      message: "lightCheckQuestion required when nextMoveChip is ask_clarifying or use_bys",
      path: ["lightCheckQuestion"],
    },
  );

/**
 * Review calibration block (3 chips, jsonb in DB). Stored as a structured
 * object; chip values are constrained to non-empty strings here. Specific
 * chip-id enums are page-side (Commit 5 — see review/page.tsx) so the
 * step component owns its label/value mapping; the schema layer only
 * guarantees the 3-field shape arrived intact.
 */
export const calibrationBlockSchema = z.object({
  compare: z.string().min(1).max(40),
  shift: z.string().min(1).max(40),
  floor: z.string().min(1).max(40),
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

// Tools — Overwhelmed
export const createOverwhelmedSchema = z.object({
  beforeRating: z.number().int().min(1).max(5),
  bodyLocation: z.string().max(200).nullable().optional(),
  feelingLabel: z.string().min(1).max(5000),
  afterRating: z.number().int().min(1).max(5),
  afterFeeling: z.enum(TOOLS_AFTER_FEELING_VALUES),
});

// Tools — Trigger Log
export const createTriggerSchema = z.object({
  trigger: z.string().min(1).max(5000),
  interpretation: z.string().min(1).max(5000),
  emotion: z.string().min(1).max(1000),
  emotionIntensity: z.number().int().min(1).max(10),
  urge: z.string().min(1).max(1000),
  urgeIntensity: z.number().int().min(1).max(10),
  behavior: z.string().min(1).max(5000),
  outcome: z.string().min(1).max(5000),
  reflection: z.string().min(1).max(5000),
  afterFeeling: z.enum(TOOLS_AFTER_FEELING_VALUES),
});

// Persons
export const createPersonSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  relationshipDomain: z.enum([
    "partner", "friend", "family", "manager",
    "direct_report", "coworker", "client", "other",
  ]),
  relationshipSubtype: z.string().max(200).nullable().optional(),
});

// Subscribe (v0 mock — no payment fields yet)
export const subscribeSchema = z.object({
  plan: z.enum(["monthly", "annual"]),
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
// surfaced in /history. New repair flow lives inside Review.
export const repairOutcomeSchema = z.object({
  attemptedRepair: z.enum(["yes", "planned", "no"]),
  howReceived: z.enum(["positive", "mixed", "negative", "no_response", "too_early"]),
  understandingImproved: z.enum(["yes", "partly", "no", "unclear"]),
  repairEntryId: z.string().uuid(),
});
