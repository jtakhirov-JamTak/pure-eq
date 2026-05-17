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
// Coach SOT 2026-05-06 — shared enum tuples.
// ============================================================
// Tuples exported as const so step components, prompts, schemas, and
// (eventually) Insights aggregator all derive from one source. Adding a
// new value here propagates to all consumers; drift fails the build.
// Defined ABOVE the schemas that consume them so the file reads top-to-
// bottom without forward references.

const RELATIONSHIP_ENUM = z.enum([
  "partner", "friend", "family", "manager",
  "direct_report", "coworker", "client", "other",
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
// in the DB for /history reads on legacy rows; new posts do not send them.

// SOT 2026-05-08 Commit 4: 16-step / 16-field schema. Pages now read:
//   1. personName, relationship, situation
//   2. primaryEmotion (text+body), emotionAsData, defaultPattern
//   3. observedFromThem, theirStateHedged, fairestVersion
//   4. predictedReaction, hiddenExpectation, specificShift, outcomeFloor
//   5. neutralCheckQuestion, opener (text only), triggerPlan
// bodyLocation is the body chip paired with primaryEmotion (the felt sense
// going in). 0036 originally attached body_location to opener; 0037 leaves
// the column as-is and re-purposes the consumer — same column, new pairing.
export const createPrepareSchema = z.object({
  // Page 1 — person + relationship + situation
  personName: z.string().trim().min(1).max(200),
  relationship: RELATIONSHIP_ENUM,
  situation: z.string().trim().min(1).max(5000),
  // Page 2 — primary emotion (+ body) + emotion-as-data + default pattern
  primaryEmotion: z.string().trim().min(1).max(2000),
  bodyLocation: z.enum(BODY_LOCATION_VALUES),
  emotionAsData: z.string().trim().min(1).max(2000),
  defaultPattern: z.string().trim().min(1).max(2000),
  // Page 3 — observed/state-hedged/fairest
  observedFromThem: z.string().trim().min(1).max(2000),
  theirStateHedged: z.string().trim().min(1).max(2000),
  fairestVersion: z.string().trim().min(1).max(2000),
  // Page 4 — predicted reaction + hidden expectation + specific shift + outcome floor
  predictedReaction: z.string().trim().min(1).max(2000),
  hiddenExpectation: z.string().trim().min(1).max(2000),
  specificShift: z.string().trim().min(1).max(2000),
  outcomeFloor: z.string().trim().min(1).max(2000),
  // Page 5 — neutral check question + opener (text only) + trigger plan
  neutralCheckQuestion: z.string().trim().min(1).max(2000),
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

// Coach SOT 2026-05-06: Review now splits Quick (~2 min, 4 Qs, no repair)
// vs Full (~5 min, branches into calibration vs standalone on page 5,
// optional Repair sub-flow). Both depths share the same baseline first-page
// fields. Repair-branch field swap (impactToName, theirNeedFirst, etc.)
// lands in Commit 6; for now repair fields stay optional + nullable so
// new posts can ship without them and historical reads still parse.
export const createReviewSchema = z.object({
  // Depth discriminator. Quick = 2 pages, no repair branch. Full = up to
  // 5 pages with conditional repair branch.
  reviewDepth: z.enum(["quick", "full"]).default("full"),
  // Base fields (always required by both depths).
  whatHappened: z.string().trim().min(1).max(5000),
  // Cross-eval batch #1 (2026-05-03): two-column observed/interpreted step.
  observedRaw: z.string().trim().min(1).max(2000),
  interpretedRaw: z.string().trim().min(1).max(2000),
  // SOT 2026-05-08: Quick no longer collects hardestMomentFeeling; Full
  // replaces it with feltAtHardestMoment + body chip + a separate
  // feelingTracking Q ("Was the feeling tracking something real?").
  // Legacy column kept nullable for /history reads.
  hardestMomentFeeling: z.string().trim().min(1).max(5000).optional(),
  // SOT 2026-05-08 Commit 5: 8 new Full-Review Qs (felt-at-hardest-moment
  // text + body, feeling-tracking, easier-or-harder, treat-as-data,
  // something-that-helped, their-in-moment-experience, signs-how-they-
  // left, turning-point). Schema fields are optional + nullable so Quick
  // can omit them entirely; Full posts populate. Empty strings rejected
  // (`.min(1)`) so the page-canAdvance contract holds at the API boundary.
  feltAtHardestMoment: z.string().trim().min(1).max(5000).nullable().optional(),
  feelingTracking: z.string().trim().min(1).max(5000).nullable().optional(),
  easierOrHarder: z.string().trim().min(1).max(5000).nullable().optional(),
  treatAsData: z.string().trim().min(1).max(5000).nullable().optional(),
  somethingThatHelped: z.string().trim().min(1).max(5000).nullable().optional(),
  theirInMomentExperience: z.string().trim().min(1).max(5000).nullable().optional(),
  signsHowTheyLeft: z.string().trim().min(1).max(5000).nullable().optional(),
  turningPoint: z.string().trim().min(1).max(5000).nullable().optional(),
  // SOT 2026-05-08 Commit 5: Page 5 standalone branch (renders when no
  // linkedPrepareEntryId). 2 textarea Qs that replace whatYouLearned.
  whatElseExplains: z.string().trim().min(1).max(5000).nullable().optional(),
  whatReadMissed: z.string().trim().min(1).max(5000).nullable().optional(),
  // Body chip paired with feltAtHardestMoment. Same 8-chip enum as
  // Prepare (no fuzzy_cant_tell — that's Pulse Check only).
  bodyLocation: z.enum(BODY_LOCATION_VALUES).nullable().optional(),
  // Page-5 shared fields (both calibration and standalone branches).
  // lessonScreen is a 3-field block; first sub-field required, others
  // optional (pageCanAdvance special-cases textarea_three_field_lesson).
  lessonScreen: z
    .object({
      a: z.string().trim().min(1).max(2000),
      b: z.string().max(2000).nullable().optional(),
      c: z.string().max(2000).nullable().optional(),
    })
    .nullable()
    .optional(),
  // Both depths now collect needsAndForecast: Quick needs it for the
  // calibration loop to have a forecast to score against later; Full
  // already had it. `forecast` carries the free-text prediction companion
  // to the chip (stored in review_entries.forecast, added in 0036).
  whatYouDid: z.string().trim().min(1).max(5000).optional(),
  observedInThem: z.string().trim().min(1).max(5000).optional(),
  theirExperience: z.string().trim().min(1).max(5000).optional(),
  whatYouAvoided: z.string().trim().min(1).max(5000).optional(),
  askBeforeUnderstanding: z.enum(["yes", "no", "unclear"]).optional(),
  needsToHappenNext: z.enum(REVIEW_NEEDS_NEXT_VALUES).optional(),
  forecast: z.string().trim().min(1).max(2000).optional(),
  // Page-5 calibration block: populated when linkedPrepareEntryId exists.
  linkedPrepareEntryId: z.string().uuid().nullable().optional(),
  calibrationBlock: z
    .object({
      // SOT 2026-05-08 fix2: chip enums enforced server-side.
      compare: z.enum(CALIBRATION_COMPARE_VALUES),
      shift: z.enum(CALIBRATION_SHIFT_VALUES),
      floor: z.enum(CALIBRATION_FLOOR_VALUES),
    })
    .nullable()
    .optional(),
  // Page-5 standalone branch: populated when no linked Prepare. Mutually
  // exclusive with calibrationBlock — page renders one or the other.
  whatProtecting: z
    .object({
      chip: z.enum(WHAT_PROTECTING_VALUES),
      text: z.string().max(500).nullable().optional(),
    })
    .nullable()
    .optional(),
  // Repair-branch fields.
  // SOT 2026-05-08 fix1: the 5-Q repair swap (impactToName / theirNeedFirst /
  // pressureVsCare / timing combo / firstRepairSentence) MUST be declared
  // here — without these, the page POSTed the fields and Zod silently
  // stripped them, losing every Repair submission. DB columns added in 0036.
  // repairBranchActive is provided by the client but the route MUST re-derive
  // it server-side from needsToHappenNext + reviewDepth (see route.ts).
  repairBranchActive: z.boolean().default(false),
  impactToName: z.string().trim().min(1).max(5000).nullable().optional(),
  theirNeedFirst: z.enum(THEIR_NEED_FIRST_VALUES).nullable().optional(),
  pressureVsCare: z.string().trim().min(1).max(5000).nullable().optional(),
  timingWhen: z.string().trim().min(1).max(2000).nullable().optional(),
  timingNow: z.boolean().nullable().optional(),
  firstRepairSentence: z.string().trim().min(1).max(2000).nullable().optional(),
  // Legacy back-compat. New posts do not write these.
  yourPart: z.string().trim().min(1).max(5000).nullable().optional(),
  secretWant: z.string().trim().min(1).max(5000).nullable().optional(),
  couldMakeThemFeel: z.string().trim().min(1).max(5000).nullable().optional(),
  // Person/thread.
  personId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
})
  // 2026-05-17 fix3 (#13): cross-field requirement guard. Without these,
  // a direct API POST with reviewDepth: "full" and every Full-only field
  // omitted passed Zod, persisted a near-empty row, and fed an emaciated
  // AI prompt. The UI page-flow gates these via pageCanAdvance, but the
  // API boundary stayed silent — a real risk for any client (the iOS app
  // shell, a Postman replay, future App #2 sharing this schema). Errors
  // here mirror the SOT page-grouping so server-rejected payloads point
  // at the page the user skipped.
  .superRefine((v, ctx) => {
    function requireField(field: keyof typeof v, label: string) {
      const value = v[field];
      if (value === null || value === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field as string],
          message: `${label} is required`,
        });
        return false;
      }
      if (typeof value === "string" && value.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field as string],
          message: `${label} is required`,
        });
        return false;
      }
      return true;
    }
    // Both depths share these terminal Qs. Quick Page 2 (whatYouDid +
    // needsAndForecast) and Full Page 5 both rely on these landing.
    requireField("whatYouDid", "What you did");
    requireField("needsToHappenNext", "What needs to happen next");
    requireField("forecast", "Forecast");
    // Full-only: Page 2 (felt-at-hardest-moment + body) + Page 3 feeling
    // tracking + Page 5 lesson screen + Page 5 page-specific Qs.
    if (v.reviewDepth === "full") {
      requireField("feltAtHardestMoment", "What you felt at the hardest moment");
      requireField("bodyLocation", "Where you felt it in your body");
      requireField("feelingTracking", "Whether the feeling tracked something real");
      requireField("whatProtecting", "What you were wanting or protecting");
      requireField("lessonScreen", "Lesson from this interaction");
      // Standalone Page 5 (no linked Prepare) replaces the calibration trio
      // with two Qs about alternative reads.
      const hasCalibration =
        v.calibrationBlock !== null && v.calibrationBlock !== undefined;
      if (!hasCalibration) {
        requireField("whatElseExplains", "What else could explain it");
        requireField("whatReadMissed", "What your read might have missed");
      }
      // Repair branch: when activated by the client, all 5 core fields land.
      // (repairBranchActive is server-re-derived in route.ts — this is just
      // a soft check that the client passed coherent data; the server
      // strips the fields if its own derivation says repair is inactive.)
      if (v.repairBranchActive) {
        requireField("impactToName", "Impact to name");
        requireField("theirNeedFirst", "Their need to address first");
        requireField("pressureVsCare", "Pressure-vs-care framing");
        requireField("timingWhen", "Repair timing");
        requireField("firstRepairSentence", "First repair sentence");
      }
    }
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
    whatFeelsOff: z.string().trim().min(1).max(2000),
    whatChangedAndBefore: z.string().trim().min(1).max(2000),
    whenItShifted: z.string().trim().min(1).max(2000),
    feelingAndBody: z.object({
      text: z.string().trim().min(1).max(2000),
      bodyLocation: z.enum(BODY_LOCATION_PULSE_VALUES),
    }),
    theirsNotAboutYou: z.string().trim().min(1).max(2000),
    storyAndAlternative: z.object({
      story: z.string().trim().min(1).max(2000),
      alternative: z.string().trim().min(1).max(2000),
    }),
    signalNoiseObservation: z.string().trim().min(1).max(1000),
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

// Tools — Overwhelmed
export const createOverwhelmedSchema = z.object({
  beforeRating: z.number().int().min(1).max(5),
  bodyLocation: z.string().max(200).nullable().optional(),
  feelingLabel: z.string().trim().min(1).max(5000),
  afterRating: z.number().int().min(1).max(5),
  afterFeeling: z.enum(TOOLS_AFTER_FEELING_VALUES),
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
