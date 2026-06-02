import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { BANNED_PHRASES, OBSERVATION_TAGS } from "@/types";

// ============================================================
// Refusal output (shared across every Coach module + Reflection)
// ============================================================
// Coach v2 (2026-04-21) introduces refusal as a 1st-class output mode.
// SAFETY_FLOOR in prompts.ts instructs the model to return this shape
// instead of the normal coaching output when abuse, crisis, or
// out-of-scope content is detected. The discriminated union on `mode`
// makes the renderer dispatch trivial.

export const REFUSAL_REASONS = ["safety_concern", "out_of_scope"] as const;
export const REFUSAL_RESOURCES = [
  "988",
  "domestic_violence_hotline",
  "therapist",
  "ea_program",
  "none",
] as const;

export const refusalShape = z.object({
  mode: z.literal("refusal"),
  refusal_reason: z.enum(REFUSAL_REASONS),
  // 400-char cap (vs the standard 300 on coach output fields) — a refusal
  // must fit a named resource + a concrete next step + the hotline number
  // in one field, and a truncated refusal in a crisis moment is worse than
  // the modest uniformity break. Monitor parsed lengths in production; if
  // observed outputs stay under 300, tighten this back.
  message_to_user: z.string().trim().min(1).max(400),
  suggested_resource: z.enum(REFUSAL_RESOURCES),
});

// ============================================================
// Prepare — tier-aware card set (coins redesign, Slice A 2026-05-29)
// ============================================================
// Quick tier = 3 cards (pressure_check, cleaner_opener, predicted_reaction).
// Deep tier = those 3 + 2 more (neutral_check_question, deeper_read). The two
// Deep fields are .optional() — the prompt fills them only when tier ===
// "deep", mirroring Review's optional repair-branch fields. predicted_reaction
// is copied into prepare_entries.predicted_reaction (route extractDerivedFromAi)
// so the Review calibration link keeps working — only the writer changed from
// a user input to this AI card. None of these are action-copy fields, so the
// Prepare output no longer contributes to ACTION_FIELDS / stripGeneric.
//
// All string fields chain `.trim().min(1)` so a model returning "" or "   "
// fails Zod parse server-side. 300-char cap unified across modules per
// the 04-20 incident.

const prepareNormalShape = z.object({
  mode: z.literal("normal"),
  // Quick tier (always required).
  pressure_check: z.string().trim().min(1).max(300),
  cleaner_opener: z.string().trim().min(1).max(300),
  predicted_reaction: z.string().trim().min(1).max(300),
  // Deep tier (populated only when tier === "deep").
  neutral_check_question: z.string().trim().min(1).max(300).optional(),
  deeper_read: z.string().trim().min(1).max(300).optional(),
  pattern_tag: z.enum(OBSERVATION_TAGS),
});

export const prepareOutputSchema = z.discriminatedUnion("mode", [
  prepareNormalShape,
  refusalShape,
]);

// ============================================================
// Pulse Check — tier-aware SignalRead cards (coins redesign 2026-05-29)
// ============================================================
// Pulse Check is a distinct module from Prepare with its own table and AI
// output column (pulse_check_entries.ai_output_json, ai_output_version). The
// lean redesign replaces the old fixed 5-card shape (real_issue,
// reality_check_question, thing_not_to_do, they_might_need, best_next_move)
// with tier-aware SignalRead cards:
//   Quick tier = 3 cards (signal_vs_noise, non_you_explanation, next_move_card).
//   Deep tier = those 3 + 2 more (stop_checking_rule, pattern_projection_risk).
// The two Deep fields are .optional() — the prompt fills them only when tier ===
// "deep", mirroring lean Prepare/Review. None of the lean cards are action-copy,
// so Pulse no longer feeds ACTION_FIELDS / stripGeneric. ai_output_version bumps
// 1 → 2; the renderer gates shape on it. Same .max(300) caps + .trim().min(1)
// whitespace gates as every other module.

const pulseCheckNormalShape = z.object({
  mode: z.literal("normal"),
  // Quick tier (always required).
  signal_vs_noise: z.string().trim().min(1).max(300),
  non_you_explanation: z.string().trim().min(1).max(300),
  next_move_card: z.string().trim().min(1).max(300),
  // Deep tier (populated only when tier === "deep").
  stop_checking_rule: z.string().trim().min(1).max(300).optional(),
  pattern_projection_risk: z.string().trim().min(1).max(300).optional(),
  pattern_tag: z.enum(OBSERVATION_TAGS),
});

export const pulseCheckOutputSchema = z.discriminatedUnion("mode", [
  pulseCheckNormalShape,
  refusalShape,
]);

// ============================================================
// Review — tier-aware InteractionLearning cards (coins redesign 2026-05-29)
// ============================================================
// Quick tier = 3 cards (turning_point, pattern_data, recommended_move).
// Deep tier = those 3 + 2 more (their_likely_experience, repeat_stop_update).
// The two Deep fields are .optional() — the prompt fills them only when tier ===
// "deep", mirroring lean Prepare. The old conditional repair-branch fields
// (what_to_own / impact_on_them / thing_not_to_say / recommended_timing) are
// gone: Repair is now its own module (the lean Review has no in-form repair
// branch). None of the lean cards are action-copy, so Review no longer feeds
// ACTION_FIELDS / stripGeneric.
//
// All string fields chain `.trim().min(1)` so a model returning "" or "   "
// fails Zod parse server-side. 300-char cap unified across modules per the
// 04-20 incident.

const reviewNormalShape = z.object({
  mode: z.literal("normal"),
  // Quick tier (always required).
  turning_point: z.string().trim().min(1).max(300),
  pattern_data: z.string().trim().min(1).max(300),
  recommended_move: z.string().trim().min(1).max(300),
  // Deep tier (populated only when tier === "deep").
  their_likely_experience: z.string().trim().min(1).max(300).optional(),
  repeat_stop_update: z.string().trim().min(1).max(300).optional(),
  pattern_tag: z.enum(OBSERVATION_TAGS),
});

export const reviewOutputSchema = z.discriminatedUnion("mode", [
  reviewNormalShape,
  refusalShape,
]);

// ============================================================
// Before You Send — verdict + three cards (lean 3-question redesign 2026-06-01)
// ============================================================
// Stateless single-tier flow (Phase 1, docs/handoff_bys_loop_router.md). The
// user gives a situation, a desired outcome, and a draft; the model infers the
// message type + the main relational risk itself and returns a verdict
// (safe | risky | do_not_send) plus three cards:
//   - main_risk:       the single biggest way the draft lands badly / misses the goal
//   - cleaner_version: a rewritten draft the user can adapt — NULL on do_not_send
//                      (the message shouldn't be sent in any form yet)
//   - why_this_works:  why the cleaner version lands better than the draft
// The old tier-aware set (how_this_will_land / thing_to_cut / check_in_question
// + Deep what_its_missing / their_likely_reply) is fully removed. cleaner_version
// is deliberately NOT an ACTION_FIELDS member — it reproduces a whole message, so
// stripGeneric must not nullify it. ai_verdict_version bumps 2 → 3; readers gate
// shape on it (legacy 1/2 rows render verdict + no cards via the field filter).
//
// cleaner_version's cap is higher than the coaching fields (it's a message
// reproduction, not a one-line note); main_risk / why_this_works keep the 300
// cap shared across coach modules (memory: project_review_max_caps_incident).
//
// `do_not_send` triggers a red banner in the UI: "Do not send. This
// message protects your ego more than the relationship."

const beforeYouSendNormalShape = z.object({
  mode: z.literal("normal"),
  verdict: z.enum(["safe", "risky", "do_not_send"]),
  main_risk: z.string().trim().min(1).max(300),
  cleaner_version: z.string().trim().min(1).max(2000).nullable(),
  why_this_works: z.string().trim().min(1).max(300),
});

export const beforeYouSendOutputSchema = z.discriminatedUnion("mode", [
  beforeYouSendNormalShape,
  refusalShape,
]);

// ============================================================
// Weekly Insights reflection output (unchanged from Insights rebuild)
// ============================================================
// Each observation MUST be grounded in at least one verbatim quote from
// the user's own entries. The API route post-processes the response and
// drops any observation whose quotes don't substring-match the cited
// source entries — fabricated quotes are filtered out before persist.

export const evidenceShape = z.object({
  quote: z.string().trim().min(1).max(240),
  source_record_id: z.string().uuid(),
  // YYYY-MM-DD (from raw_records.created_at, passed through to the model).
  source_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "source_date must be YYYY-MM-DD"),
});

export const observationShape = z.object({
  theme: z.string().trim().min(1).max(120),
  observation: z.string().trim().min(1).max(500),
  evidence: z.array(evidenceShape).min(1).max(3),
  confidence: z.enum(["tentative", "clear"]),
});

export const reflectionNormalShape = z.object({
  mode: z.literal("reflection"),
  summary: z.string().trim().min(1).max(300),
  observations: z.array(observationShape).min(2).max(3),
});

export const reflectionOutputSchema = z.discriminatedUnion("mode", [
  reflectionNormalShape,
  refusalShape,
]);

export type ReflectionOutput = z.infer<typeof reflectionOutputSchema>;
export type ReflectionNormal = z.infer<typeof reflectionNormalShape>;
export type ReflectionObservation = z.infer<typeof observationShape>;
export type ReflectionEvidence = z.infer<typeof evidenceShape>;

/**
 * Check AI output for banned phrases before displaying to user.
 * Returns the first banned phrase found, or null if clean.
 */
export function checkBannedPhrases(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      return phrase;
    }
  }
  return null;
}

// Action-copy fields that must be verb + object + trigger, or null.
// stripGeneric nullifies filler like "be more patient" so the navy
// action card is a pure function of the payload. Exported so renderers
// can drive action-vs-non-action UI off the same taxonomy (single
// source of truth — add/rename here and everywhere stays in sync).
export const ACTION_FIELDS = new Set([
  "best_next_move",
  "what_to_own",
  "thing_not_to_say",
]);

// Generic-filler rules. Each has a stable `name` so Sentry's `pattern`
// tag is filterable by human-readable label, not a regex literal.
// Exact-match rules come first so "be more patient." gets tagged
// `exact_be_more_patient` (specific) rather than `leading_be` (generic)
// — first-match-wins means order drives Sentry triage fidelity.
// `leading_try_to` requires a trailing space so "Try a Prepare..." does
// not match.
const GENERIC_RULES: { name: string; test: RegExp }[] = [
  { name: "exact_be_more_patient", test: /^be more patient\.?$/i },
  { name: "exact_listen_more", test: /^listen more\.?$/i },
  { name: "exact_communicate_better", test: /^communicate better\.?$/i },
  { name: "leading_be", test: /^be\s/i },
  { name: "leading_try_to", test: /^try to\s/i },
  { name: "leading_remember_to", test: /^remember to\s/i },
  { name: "leading_dont_forget", test: /^don't forget\s/i },
  { name: "leading_consider", test: /^consider\s/i },
  { name: "leading_maybe", test: /^maybe\s/i },
];

// Per-(field, pattern) cooldown Map — mirrors src/lib/read-capture.ts
// helper shape. One-counter-across-all-rules would collapse distinct
// model-drift events (e.g., best_next_move drifting to "try to" AND
// thing_to_cut drifting to "be more") into one Sentry event. Per-key
// latching keeps triage precise while still preventing outage-flood.
const GENERIC_CAPTURE_COOLDOWN_MS = 5 * 60 * 1000;
const lastGenericCaptures = new Map<string, number>();

function captureGenericNullification(field: string, pattern: string): void {
  const key = `${field}:${pattern}`;
  const now = Date.now();
  const last = lastGenericCaptures.get(key) ?? 0;
  if (now - last < GENERIC_CAPTURE_COOLDOWN_MS) return;
  lastGenericCaptures.set(key, now);
  // sentry-scrub.ts redacts exception.values[*].value, so tags carry
  // the triage signal. NEVER put the original string in the event —
  // the scrubber drops it anyway.
  Sentry.captureException(new Error("generic_output"), {
    tags: { kind: "generic_output", field, pattern },
  });
}

/**
 * Walk AI output for banned phrases (throws), then nullify action-copy
 * fields that match a generic-filler rule (mutates in place AND returns
 * the same reference).
 *
 * Returning `T` is not just syntactic — it signals to the caller that
 * this function may change the object it was given. Bind the return if
 * you want the stripped view downstream; callers that hold the same
 * reference pick up the mutation either way.
 *
 * Walks top-level keys only. The discriminated-union coach outputs are
 * flat; the Reflection generator has its own per-observation walker
 * because evidence[*].quote is nested.
 */
export function validateAIOutput<T extends Record<string, unknown>>(
  output: T,
): T {
  for (const [key, value] of Object.entries(output)) {
    if (typeof value === "string") {
      const banned = checkBannedPhrases(value);
      if (banned) {
        throw new Error(
          `AI output field "${key}" contains banned phrase: "${banned}"`
        );
      }
    }
  }
  for (const key of ACTION_FIELDS) {
    const value = output[key];
    if (typeof value !== "string" || value.trim().length === 0) continue;
    for (const rule of GENERIC_RULES) {
      if (rule.test.test(value)) {
        (output as Record<string, unknown>)[key] = null;
        captureGenericNullification(key, rule.name);
        break;
      }
    }
  }
  return output;
}
