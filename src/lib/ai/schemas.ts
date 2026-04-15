import { z } from "zod";
import { BANNED_PHRASES, OBSERVATION_TAGS } from "@/types";

// Prepare AI output schema
export const prepareOutputSchema = z.object({
  likely_blind_spot: z.string().max(120),
  reality_check_question: z.string().max(150),
  thing_not_to_do: z.string().max(120),
  user_read_accuracy: z.string().max(150),
  what_user_may_be_missing: z.string().max(150),
  best_next_move: z.string().max(120),
});

// Review AI output schema
export const reviewOutputSchema = z.object({
  how_user_likely_came_across: z.string().max(200),
  where_projecting: z.string().max(200),
  alternative_explanation: z.string().max(200),
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
