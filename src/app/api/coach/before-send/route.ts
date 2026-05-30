import { z } from "zod";
import { createBeforeYouSendSchema } from "@/lib/validation";
import { beforeYouSendOutputSchema } from "@/lib/ai/schemas";
import { buildBeforeYouSendPrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

// MUST exactly match the value added to raw_records.record_type CHECK in
// migration 0025. runCoachModule writes record_type: name + module_type: name
// directly. Drift between this constant and the CHECK constraint = 23514
// constraint violation on every BYS submit.
const BYS_MODULE_NAME = "before_you_send" as const;

const requestSchema = createBeforeYouSendSchema.extend({
  idempotencyKey: z.string().uuid(),
  // Slice B coins: false = free Save (no AI, no debit); true = paid Get-AI-
  // feedback. Defaults to true in run-module for combined-submit back-compat.
  generateAi: z.boolean().optional(),
});

type Input = z.infer<typeof createBeforeYouSendSchema>;
type AiOutput = z.infer<typeof beforeYouSendOutputSchema>;

// Exported so vitest round-trip tests can call buildDerivedInsert /
// buildPayloadFields directly and catch column-rename / version drift the
// schema-only tests miss (same pattern as pulseCheckModuleConfig).
export const beforeYouSendModuleConfig: CoachModuleConfig<Input, AiOutput> = {
  moduleName: BYS_MODULE_NAME,
  requestSchema,
  aiOutputSchema: beforeYouSendOutputSchema,
  // BYS is stateless — no person, no thread. runCoachModule skips both
  // resolution blocks when these flags are set.
  personBehavior: "skip",
  threadBehavior: "none",
  derivedTable: "before_you_send_entries",
  derivedIdColumn: "before_you_send_entry_id",
  aiJsonColumn: "ai_verdict_json",
  aiVersionColumn: "ai_verdict_version",
  // Coins redesign BYS lean slice 2026-05-30: bump 1 → 2. The output shape
  // changes from the fixed 4-field {verdict, how_this_will_land,
  // what_its_missing, thing_to_cut, check_in_question} set to the tier-aware
  // set — Quick = {verdict, how_this_will_land, thing_to_cut,
  // check_in_question}; Deep adds {what_its_missing, their_likely_reply}.
  // Readers MUST gate on ai_verdict_version when distinguishing shape —
  // 2 = lean tiered, 1/NULL = legacy single-tier.
  aiVersionValue: 2,

  buildPayloadFields: (input) => ({
    tier: input.tier,
    draftText: input.draftText,
    messageType: input.messageType,
    intentOptional: input.intentOptional ?? null,
    riskContext: input.riskContext ?? null,
  }),

  buildDerivedInsert: (input) => ({
    draft_text: input.draftText,
    message_type: input.messageType,
    intent_optional: input.intentOptional ?? null,
    risk_context: input.riskContext ?? null,
    ai_tier: input.tier,
  }),

  buildPrompt: (input, profile) =>
    buildBeforeYouSendPrompt({
      profile,
      tier: input.tier,
      draftText: input.draftText,
      messageType: input.messageType,
      intentOptional: input.intentOptional ?? null,
      riskContext: input.riskContext ?? null,
    }),

  buildResponseExtras: (derivedEntryId) => ({
    beforeYouSendEntryId: derivedEntryId,
  }),
};

export async function POST(req: Request) {
  return runCoachModule(req, beforeYouSendModuleConfig);
}
