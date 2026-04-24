import { z } from "zod";
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
// Prepare — discriminated union (Coach v2, 2026-04-23)
// ============================================================
// Both Path A ("I need to have a conversation") and Path B ("Something
// feels off") produce the same AI output shape. The 5 user-visible
// cards: real_issue, reality_check_question, thing_not_to_do,
// they_might_need, best_next_move. Plus pattern_tag (display-only for v1).
//
// All string fields chain `.trim().min(1)` so a model returning "" or "   "
// fails Zod parse server-side. 300-char cap unified across modules per
// the 04-20 incident.

const prepareNormalShape = z.object({
  mode: z.literal("normal"),
  real_issue: z.string().trim().min(1).max(300),
  reality_check_question: z.string().trim().min(1).max(300),
  thing_not_to_do: z.string().trim().min(1).max(300),
  they_might_need: z.string().trim().min(1).max(300),
  best_next_move: z.string().trim().min(1).max(300),
  pattern_tag: z.enum(OBSERVATION_TAGS),
});

export const prepareOutputSchema = z.discriminatedUnion("mode", [
  prepareNormalShape,
  refusalShape,
]);

// ============================================================
// Review — discriminated union with optional repair-branch fields
// ============================================================
// Review's output shape is conditional. Always shows 4 base cards
// (how_you_came_across, impact_vs_intent, alternative_explanation,
// question_you_missed). When the user's needs_to_happen_next select
// triggers the repair branch AND they pass the readiness gate, the
// model also fills 4 repair-branch fields (what_to_own, impact_on_them,
// thing_not_to_say, recommended_timing).
//
// All 4 repair fields are .optional() — the prompt instructs the model
// to populate them only when given the repair-branch context. The
// renderer uses the same field-presence-filter pattern as before to
// decide which cards to show.

const reviewNormalShape = z.object({
  mode: z.literal("normal"),
  // Always required.
  how_you_came_across: z.string().trim().min(1).max(300),
  impact_vs_intent: z.string().trim().min(1).max(300),
  alternative_explanation: z.string().trim().min(1).max(300),
  question_you_missed: z.string().trim().min(1).max(300),
  // Repair branch — populated only when repairBranchActive is true.
  what_to_own: z.string().trim().min(1).max(300).optional(),
  impact_on_them: z.string().trim().min(1).max(300).optional(),
  thing_not_to_say: z.string().trim().min(1).max(300).optional(),
  recommended_timing: z.string().trim().min(1).max(300).optional(),
  pattern_tag: z.enum(OBSERVATION_TAGS),
});

export const reviewOutputSchema = z.discriminatedUnion("mode", [
  reviewNormalShape,
  refusalShape,
]);

// ============================================================
// Before You Send — NEW (Coach redesign 2026-04-23)
// ============================================================
// Stateless verdict-only flow. User pastes a draft message + selects
// message_type; model returns a verdict (safe | risky | do_not_send)
// and 4 short fields. `thing_to_cut` should QUOTE the user's actual
// words verbatim — the prompt enforces this.
//
// `do_not_send` triggers a red banner in the UI: "Do not send. This
// message protects your ego more than the relationship."

const beforeYouSendNormalShape = z.object({
  mode: z.literal("normal"),
  verdict: z.enum(["safe", "risky", "do_not_send"]),
  how_this_will_land: z.string().trim().min(1).max(300),
  what_its_missing: z.string().trim().min(1).max(300),
  thing_to_cut: z.string().trim().min(1).max(300),
  check_in_question: z.string().trim().min(1).max(300),
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

/**
 * Validate all string fields in an AI output object for banned phrases.
 * Returns true if clean, throws if a banned phrase is found.
 *
 * Walks top-level keys only. The discriminated-union outputs in this
 * file are flat (no nested objects), so this catches every user-visible
 * string. The Reflection generator has its own per-observation walker
 * because evidence[*].quote is nested.
 */
export function validateAIOutput(output: Record<string, unknown>): boolean {
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
  return true;
}
