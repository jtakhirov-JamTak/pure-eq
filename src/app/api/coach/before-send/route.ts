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
});

type Input = z.infer<typeof createBeforeYouSendSchema>;
type AiOutput = z.infer<typeof beforeYouSendOutputSchema>;

const config: CoachModuleConfig<Input, AiOutput> = {
  moduleName: BYS_MODULE_NAME,
  requestSchema,
  aiOutputSchema: beforeYouSendOutputSchema,
  subscriptionGate: "free_one",
  freeUsageField: "freeBeforeYouSendUsed",
  // BYS is stateless — no person, no thread. runCoachModule skips both
  // resolution blocks when these flags are set.
  personBehavior: "skip",
  threadBehavior: "none",
  derivedTable: "before_you_send_entries",
  derivedIdColumn: "before_you_send_entry_id",
  aiJsonColumn: "ai_verdict_json",
  aiVersionColumn: "ai_verdict_version",
  aiVersionValue: 1,

  buildPayloadFields: (input) => ({
    draftText: input.draftText,
    messageType: input.messageType,
    intentOptional: input.intentOptional ?? null,
  }),

  buildDerivedInsert: (input) => ({
    draft_text: input.draftText,
    message_type: input.messageType,
    intent_optional: input.intentOptional ?? null,
  }),

  buildPrompt: (input, profile) =>
    buildBeforeYouSendPrompt({
      profile,
      draftText: input.draftText,
      messageType: input.messageType,
      intentOptional: input.intentOptional ?? null,
    }),

  buildResponseExtras: (derivedEntryId) => ({
    beforeYouSendEntryId: derivedEntryId,
  }),
};

export async function POST(req: Request) {
  return runCoachModule(req, config);
}
