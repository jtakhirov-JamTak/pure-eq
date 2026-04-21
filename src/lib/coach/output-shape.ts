import type { z } from "zod";
import { refusalShape } from "@/lib/ai/schemas";

// Type guards for Coach AI output.
//
// Today every stored AI output is legacy v1: a plain object with
// per-module coaching fields (`reality_check_question`, `repair_strategy`,
// `how_user_likely_came_across`, etc.) and NO `mode` discriminator.
//
// Coach v2 (landing across the remaining rollout commits) switches every
// module to a discriminated union: `{ mode: "normal", ...coaching }` or
// `{ mode: "refusal", ...refusalFields }`.
//
// Renderers use these guards to pick a render branch per output object.
// No DB read is needed — shape discrimination is self-describing.

export type RefusalOutput = z.infer<typeof refusalShape>;

// Legacy v1 output has no discriminator. Any plain object without a
// `mode` key counts — the specific per-module fields
// (reality_check_question / repair_strategy / …) live on the caller
// types and are not checked here.
export type LegacyV1Output = Record<string, unknown>;

export function isLegacyV1(o: unknown): o is LegacyV1Output {
  return typeof o === "object" && o !== null && !("mode" in o);
}

export function isRefusal(o: unknown): o is RefusalOutput {
  return refusalShape.safeParse(o).success;
}
