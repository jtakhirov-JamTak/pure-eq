import { z } from "zod";
import { BANNED_PHRASES } from "@/types";

// All string fields chain `.trim().min(1)` so a model returning "" or "   "
// fails Zod parse server-side and the route retries or surfaces the
// saved-but-no-ai fallback, rather than rendering an empty card in the UI.
// 300-char cap unified across modules. Observed 268 chars on a concrete
// behavior-level Review output (04-20 incident) — 200 was too tight;
// 300 gives headroom while the BREVITY block in prompts.ts keeps typical
// outputs well under the cap.
export const prepareOutputSchema = z.object({
  reality_check_question: z.string().trim().min(1).max(300),
  thing_not_to_do: z.string().trim().min(1).max(300),
  best_next_move: z.string().trim().min(1).max(300),
});

export const repairOutputSchema = z.object({
  repair_strategy: z.string().trim().min(1).max(300),
  thing_not_to_say: z.string().trim().min(1).max(300),
  recommended_timing: z.string().trim().min(1).max(300),
});

export const reviewOutputSchema = z.object({
  how_user_likely_came_across: z.string().trim().min(1).max(300),
  alternative_explanation: z.string().trim().min(1).max(300),
});

// Coach v2 refusal output. When the safety floor triggers (abuse, crisis,
// or out-of-scope input), the model returns this shape instead of the
// normal per-module coaching object. Defined standalone in this commit;
// wired into per-module discriminated unions in a later commit.
//
// The REFUSAL_REASONS / REFUSAL_RESOURCES tuples are exported so that
// `prompts.ts` can import and template-interpolate them into SAFETY_FLOOR.
// Renaming a token breaks the `satisfies` check in prompts.ts at compile
// time — preventing silent drift between the prompt text (what we ask
// the model to emit) and the enum (what we accept back).
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
