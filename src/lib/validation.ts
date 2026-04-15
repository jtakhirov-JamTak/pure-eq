// Pure EQ domain — replace in fork.
import { z } from "zod";

// Onboarding
export const quizAnswerSchema = z.object({
  questionIndex: z.number().int().min(0).max(8),
  selectedOption: z.enum(["A", "B", "C", "D", "E"]),
});

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
  );

// Coach — Prepare
export const createPrepareSchema = z.object({
  personName: z.string().min(1).max(200),
  relationship: z.enum([
    "partner", "friend", "family", "manager",
    "direct_report", "coworker", "client", "other",
  ]),
  situation: z.string().min(1).max(5000),
  desiredOutcome: z.string().min(1).max(5000),
  primaryEmotion: z.string().min(1).max(1000),
  defaultPattern: z.string().min(1).max(5000),
  otherPersonHypothesis: z.string().min(1).max(5000),
  realityCheckQuestion: z.string().min(1).max(5000),
  triggerPlan: z.string().min(1).max(5000),
  inputModes: z.record(z.string(), z.enum(["voice", "text"])).optional(),
  personId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

// Coach — Review
export const createReviewSchema = z.object({
  whatHappened: z.string().min(1).max(5000),
  hardestMomentFeeling: z.string().min(1).max(5000),
  observedInThem: z.string().min(1).max(5000),
  theirExperience: z.string().min(1).max(5000),
  whatHelped: z.string().min(1).max(5000),
  whatHurt: z.string().min(1).max(5000),
  validatedAssumptions: z.string().max(5000).optional(),
  unresolvedAndNext: z.string().min(1).max(500),
  inputModes: z.record(z.string(), z.enum(["voice", "text"])).optional(),
  personId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

// Tools — Overwhelmed
export const createOverwhelmedSchema = z.object({
  beforeRating: z.number().min(1).max(5),
  bodyLocation: z.string().max(200).nullable().optional(),
  feelingLabel: z.string().min(1).max(5000),
  afterRating: z.number().min(1).max(5),
  afterFeeling: z.string().min(1).max(200),
  inputModes: z.record(z.string(), z.enum(["voice", "text"])).optional(),
});

// Tools — Trigger Log
export const createTriggerSchema = z.object({
  trigger: z.string().min(1).max(5000),
  interpretation: z.string().min(1).max(5000),
  emotion: z.string().min(1).max(1000),
  emotionIntensity: z.number().min(1).max(10),
  urge: z.string().min(1).max(1000),
  urgeIntensity: z.number().min(1).max(10),
  behavior: z.string().min(1).max(5000),
  outcome: z.string().min(1).max(5000),
  reflection: z.string().min(1).max(5000),
  afterFeeling: z.string().min(1).max(200),
  inputModes: z.record(z.string(), z.enum(["voice", "text"])).optional(),
});

// Outcome tracking
export const immediateOutcomeSchema = z.object({
  movedForward: z.enum(["yes", "partly", "no", "unclear"]),
  theySeemUnderstood: z.enum(["more", "same", "less", "unclear"]),
  usedPreparePlan: z.enum(["yes", "partly", "no", "no_prepare"]),
  reviewId: z.string().uuid(),
});

// Voice transcription
export const transcribeSchema = z.object({
  // Audio sent as FormData — validated at the route level
  fieldName: z.string().min(1).max(100),
});
