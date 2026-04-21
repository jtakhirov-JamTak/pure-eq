// Offline eval arm configs. Six arms cross (thinking × effort).
//
// Critical: thinking-on arms use { type: "adaptive" }.
// Do NOT change to { type: "enabled" }. Do NOT add budget_tokens.
// "enabled" and "adaptive" are not interchangeable API shapes.
//
// max_tokens is held constant at 4096 for all six arms so the comparison is
// not biased by a low ceiling. Sonnet 4.6 pricing (per 1M tokens): $3 input,
// $15 output. Thinking tokens are billed as output tokens when the API
// surfaces them; on SDK 0.89 they are already folded into Usage.output_tokens.

export type ArmId =
  | "disabled_low"
  | "disabled_medium"
  | "disabled_high"
  | "adaptive_low"
  | "adaptive_medium"
  | "adaptive_high";

type ThinkingMode = "disabled" | "adaptive";
type Effort = "low" | "medium" | "high";

export interface ArmConfig {
  id: ArmId;
  thinking: { type: "disabled" } | { type: "adaptive" };
  output_config: { effort: Effort };
  thinking_mode: ThinkingMode;
  effort: Effort;
}

export const ARMS: readonly ArmConfig[] = [
  {
    id: "disabled_low",
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    thinking_mode: "disabled",
    effort: "low",
  },
  {
    id: "disabled_medium",
    thinking: { type: "disabled" },
    output_config: { effort: "medium" },
    thinking_mode: "disabled",
    effort: "medium",
  },
  {
    id: "disabled_high",
    thinking: { type: "disabled" },
    output_config: { effort: "high" },
    thinking_mode: "disabled",
    effort: "high",
  },
  {
    id: "adaptive_low",
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    thinking_mode: "adaptive",
    effort: "low",
  },
  {
    id: "adaptive_medium",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    thinking_mode: "adaptive",
    effort: "medium",
  },
  {
    id: "adaptive_high",
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    thinking_mode: "adaptive",
    effort: "high",
  },
] as const;

export const MODEL = "claude-sonnet-4-6";
export const MAX_TOKENS = 4096;

const PRICE_INPUT_PER_M_USD = 3;
const PRICE_OUTPUT_PER_M_USD = 15;

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number,
): number {
  return (
    (inputTokens * PRICE_INPUT_PER_M_USD +
      (outputTokens + thinkingTokens) * PRICE_OUTPUT_PER_M_USD) /
    1_000_000
  );
}
