// Pure EQ — Coach SOT 2026-05-06: Pulse Check module.
//
// Pulse Check is its own module with its own derived table
// (pulse_check_entries) and its own free-use flag (freePulseCheckUsed).
// Same shared runner as Prepare/Review/BYS — only the per-module
// CoachModuleConfig differs.
//
// Field flattening: createPulseCheckSchema groups feelingAndBody and
// storyAndAlternative as nested objects (so the Zod refinement on
// lightCheckQuestion can read all related fields). The DB schema uses
// flat columns. buildPayloadFields and buildDerivedInsert flatten
// `.feelingAndBody.text` → `feeling_text`, `.bodyLocation` → `body_location`,
// `.storyAndAlternative.story` → `story`, `.alternative` → `alternative`.

import { z } from "zod";
import { createPulseCheckSchema } from "@/lib/validation";
import { pulseCheckOutputSchema } from "@/lib/ai/schemas";
import { buildPulseCheckPrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

const requestSchema = createPulseCheckSchema.and(
  z.object({ idempotencyKey: z.string().uuid() }),
);

type Input = z.infer<typeof createPulseCheckSchema>;
type AiOutput = z.infer<typeof pulseCheckOutputSchema>;

const config: CoachModuleConfig<Input, AiOutput> = {
  moduleName: "pulse_check",
  requestSchema: requestSchema as unknown as CoachModuleConfig<
    Input,
    AiOutput
  >["requestSchema"],
  aiOutputSchema: pulseCheckOutputSchema,
  subscriptionGate: "free_one",
  freeUsageField: "freePulseCheckUsed",
  personBehavior: "resolve",
  personDedup: "name_and_relationship",
  threadBehavior: "auto_create",
  derivedTable: "pulse_check_entries",
  derivedIdColumn: "pulse_check_entry_id",
  aiJsonColumn: "ai_output_json",
  aiVersionColumn: "ai_output_version",
  // First version of this module's AI output. Bump on shape change.
  aiVersionValue: 1,

  buildPayloadFields: (input) => ({
    personName: input.personName,
    relationship: input.relationship,
    whatFeelsOff: input.whatFeelsOff,
    whatChangedAndBefore: input.whatChangedAndBefore,
    whenItShifted: input.whenItShifted,
    feelingText: input.feelingAndBody.text,
    bodyLocation: input.feelingAndBody.bodyLocation,
    theirsNotAboutYou: input.theirsNotAboutYou,
    story: input.storyAndAlternative.story,
    alternative: input.storyAndAlternative.alternative,
    signalNoiseObservation: input.signalNoiseObservation,
    nextMoveChip: input.nextMoveChip,
    lightCheckQuestion: input.lightCheckQuestion ?? null,
  }),

  buildDerivedInsert: (input) => ({
    what_feels_off: input.whatFeelsOff,
    what_changed_and_before: input.whatChangedAndBefore,
    when_it_shifted: input.whenItShifted,
    feeling_text: input.feelingAndBody.text,
    body_location: input.feelingAndBody.bodyLocation,
    theirs_not_about_you: input.theirsNotAboutYou,
    story: input.storyAndAlternative.story,
    alternative: input.storyAndAlternative.alternative,
    signal_noise_observation: input.signalNoiseObservation,
    next_move_chip: input.nextMoveChip,
    light_check_question: input.lightCheckQuestion ?? null,
  }),

  buildPrompt: (input, profile) =>
    buildPulseCheckPrompt({
      profile,
      personName: input.personName,
      relationship: input.relationship,
      whatFeelsOff: input.whatFeelsOff,
      whatChangedAndBefore: input.whatChangedAndBefore,
      whenItShifted: input.whenItShifted,
      feelingText: input.feelingAndBody.text,
      bodyLocation: input.feelingAndBody.bodyLocation,
      theirsNotAboutYou: input.theirsNotAboutYou,
      story: input.storyAndAlternative.story,
      alternative: input.storyAndAlternative.alternative,
      signalNoiseObservation: input.signalNoiseObservation,
      nextMoveChip: input.nextMoveChip,
      lightCheckQuestion: input.lightCheckQuestion ?? null,
    }),

  buildResponseExtras: (derivedEntryId) => ({
    pulseCheckEntryId: derivedEntryId,
  }),

  getThreadTitle: (input) => {
    const truncated = input.whatFeelsOff.slice(0, 80).replace(/\s+\S*$/, "");
    return truncated || input.whatFeelsOff.slice(0, 80);
  },
};

export async function POST(req: Request) {
  return runCoachModule(req, config);
}
