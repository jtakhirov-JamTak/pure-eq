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
  secretWant: z.string().min(1).max(5000).nullable().optional(),
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
  // BYS has no person/thread concept; runCoachModule's personBehavior:"skip"
  // + threadBehavior:"none" config skips those resolution steps.
});

// Tools — Overwhelmed
export const createOverwhelmedSchema = z.object({
  beforeRating: z.number().int().min(1).max(5),
  bodyLocation: z.string().max(200).nullable().optional(),
  feelingLabel: z.string().min(1).max(5000),
  afterRating: z.number().int().min(1).max(5),
  afterFeeling: z.string().min(1).max(200),
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
  afterFeeling: z.string().min(1).max(200),
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
