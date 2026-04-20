import { z } from "zod";
import { BANNED_PHRASES, OBSERVATION_TAGS } from "@/types";

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
  pattern_tag: z.enum(OBSERVATION_TAGS),
});

export const repairOutputSchema = z.object({
  repair_strategy: z.string().trim().min(1).max(300),
  thing_not_to_say: z.string().trim().min(1).max(300),
  recommended_timing: z.string().trim().min(1).max(300),
  pattern_tag: z.enum(OBSERVATION_TAGS),
});

export const reviewOutputSchema = z.object({
  how_user_likely_came_across: z.string().trim().min(1).max(300),
  alternative_explanation: z.string().trim().min(1).max(300),
  pattern_tag: z.enum(OBSERVATION_TAGS),
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
