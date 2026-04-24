import { z } from "zod";
import { NextResponse } from "next/server";
import {
  prepareSchemaPathA,
  prepareSchemaPathB,
} from "@/lib/validation";
import { prepareOutputSchema } from "@/lib/ai/schemas";
import {
  buildPreparePromptPathA,
  buildPreparePromptPathB,
} from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

// ============================================================
// Path A — "I need to have a conversation"
// ============================================================
const requestSchemaA = prepareSchemaPathA.extend({
  idempotencyKey: z.string().uuid(),
});

type InputA = z.infer<typeof prepareSchemaPathA>;
type AiOutput = z.infer<typeof prepareOutputSchema>;

const configA: CoachModuleConfig<InputA, AiOutput> = {
  moduleName: "prepare",
  requestSchema: requestSchemaA,
  aiOutputSchema: prepareOutputSchema,
  subscriptionGate: "free_one",
  freeUsageField: "freePrepareUsed",
  personBehavior: "resolve",
  personDedup: "name_and_relationship",
  threadBehavior: "auto_create",
  derivedTable: "prepare_entries",
  derivedIdColumn: "prepare_entry_id",
  aiJsonColumn: "ai_plan_json",
  aiVersionColumn: "ai_plan_version",
  // 2026-04-23: bump 5 → 6 alongside PROMPT_VERSION 3.1.0 → 4.0.0 and the
  // nullable-action-field shape change (best_next_move). Distinguishes
  // post-shape rows that may contain explicit null from legacy 5-rows.
  aiVersionValue: 6,

  buildPayloadFields: (input) => ({
    path: "path_a",
    personName: input.personName,
    relationship: input.relationship,
    situation: input.situation,
    primaryEmotion: input.primaryEmotion,
    defaultPattern: input.defaultPattern,
    otherPersonHypothesis: input.otherPersonHypothesis,
    theirNeed: input.theirNeed,
    realityCheckQuestion: input.realityCheckQuestion,
    howToMakeThemFeel: input.howToMakeThemFeel,
    triggerPlan: input.triggerPlan,
  }),

  buildDerivedInsert: (input) => ({
    path: "path_a",
    situation_text: input.situation,
    primary_value: input.primaryEmotion,
    their_need: input.theirNeed,
    how_to_make_them_feel: input.howToMakeThemFeel,
  }),

  buildPrompt: (input, profile) =>
    buildPreparePromptPathA({
      profile,
      personName: input.personName,
      relationship: input.relationship,
      situation: input.situation,
      primaryEmotion: input.primaryEmotion,
      defaultPattern: input.defaultPattern,
      otherPersonHypothesis: input.otherPersonHypothesis,
      theirNeed: input.theirNeed,
      realityCheckQuestion: input.realityCheckQuestion,
      howToMakeThemFeel: input.howToMakeThemFeel,
      triggerPlan: input.triggerPlan,
    }),

  buildResponseExtras: () => ({}),

  getThreadTitle: (input) => {
    const truncated = input.situation.slice(0, 80).replace(/\s+\S*$/, "");
    return truncated || input.situation.slice(0, 80);
  },
};

// ============================================================
// Path B — "Something feels off"
// ============================================================
const requestSchemaB = prepareSchemaPathB.extend({
  idempotencyKey: z.string().uuid(),
});

type InputB = z.infer<typeof prepareSchemaPathB>;

const configB: CoachModuleConfig<InputB, AiOutput> = {
  moduleName: "prepare",
  requestSchema: requestSchemaB,
  aiOutputSchema: prepareOutputSchema,
  subscriptionGate: "free_one",
  freeUsageField: "freePrepareUsed",
  personBehavior: "resolve",
  personDedup: "name_and_relationship",
  threadBehavior: "auto_create",
  derivedTable: "prepare_entries",
  derivedIdColumn: "prepare_entry_id",
  aiJsonColumn: "ai_plan_json",
  aiVersionColumn: "ai_plan_version",
  // Same 5 → 6 bump as Path A — they share the same derived table and
  // ai_plan_json shape.
  aiVersionValue: 6,

  buildPayloadFields: (input) => ({
    path: "path_b",
    personName: input.personName,
    relationship: input.relationship,
    whatFeelsOff: input.whatFeelsOff,
    whatChanged: input.whatChanged,
    storyTellingYourself: input.storyTellingYourself,
    afraidItMeans: input.afraidItMeans,
    realityCheckQuestion: input.realityCheckQuestion,
    triggerPlan: input.triggerPlan,
  }),

  buildDerivedInsert: (input) => ({
    path: "path_b",
    what_feels_off: input.whatFeelsOff,
    what_changed: input.whatChanged,
    story_telling_yourself: input.storyTellingYourself,
    afraid_it_means: input.afraidItMeans,
  }),

  buildPrompt: (input, profile) =>
    buildPreparePromptPathB({
      profile,
      personName: input.personName,
      relationship: input.relationship,
      whatFeelsOff: input.whatFeelsOff,
      whatChanged: input.whatChanged,
      storyTellingYourself: input.storyTellingYourself,
      afraidItMeans: input.afraidItMeans,
      realityCheckQuestion: input.realityCheckQuestion,
      triggerPlan: input.triggerPlan,
    }),

  buildResponseExtras: () => ({}),

  getThreadTitle: (input) => {
    const truncated = input.whatFeelsOff.slice(0, 80).replace(/\s+\S*$/, "");
    return truncated || input.whatFeelsOff.slice(0, 80);
  },
};

// Dispatch: peek at body.path (clone request so runCoachModule can re-read).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.clone().json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const path = (body as { path?: string } | null)?.path;
  if (path === "path_a") return runCoachModule(req, configA);
  if (path === "path_b") return runCoachModule(req, configB);
  return NextResponse.json(
    { error: "Invalid path — must be 'path_a' or 'path_b'" },
    { status: 400 },
  );
}
