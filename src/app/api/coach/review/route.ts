import { z } from "zod";
import { createReviewSchema } from "@/lib/validation";
import { reviewOutputSchema } from "@/lib/ai/schemas";
import { buildReviewPrompt } from "@/lib/ai/prompts";
import { runCoachModule } from "@/lib/coach/run-module";
import { findLinkedPrepareEntry } from "@/lib/coach/calibration";
import type { CoachModuleConfig } from "@/lib/coach/types";

export const runtime = "nodejs";

// ============================================================
// Review — lean 7-field flow, tier-aware cards (coins redesign 2026-05-29)
// ============================================================
// The lean form sends 7 fields + a Quick/Deep tier. The old Quick/Full form
// split, page-5 calibration chips, and in-form Repair branch are gone. Removed
// SOT inputs (review_depth, hardest_moment_feeling, the 8 Full SOT Qs,
// body_location, lesson_about_*, treat_as_data, what_protecting,
// calibration_block, needs_to_happen_next, forecast, the 6 repair columns) keep
// their columns nullable for legacy export reads; new posts do not write them.
// Two inputs merge: lessonScreen + treatAsData → data_and_update; the
// needs_to_happen_next taxonomy → the leaner next_move chip. The Prepare→Review
// calibration link is UNCHANGED — prePromptEnrich still resolves the most-recent
// linked Prepare server-side and feeds predicted_reaction into the prompt.

const requestSchema = createReviewSchema.extend({
  idempotencyKey: z.string().uuid(),
  // Slice B coins: false = free Save; true = paid Get-AI-feedback (default true
  // in run-module for combined-submit back-compat).
  generateAi: z.boolean().optional(),
});

type Input = z.infer<typeof createReviewSchema> & {
  // Augmented by prePromptEnrich when a linked Prepare exists. The server-side
  // lookup is authoritative; the client never sets these.
  prepareSnapshotForPrompt?: {
    situation: string | null;
    predictedReaction: string | null;
    emotionAsData: string | null;
    hiddenExpectation: string | null;
    specificShift: string | null;
    outcomeFloor: string | null;
    opener: string | null;
    primaryEmotion: string | null;
    defaultPattern: string | null;
    neutralCheckQuestion: string | null;
  };
};
type AiOutput = z.infer<typeof reviewOutputSchema>;

// Exported so vitest round-trip tests can call buildDerivedInsert /
// buildPayloadFields directly and catch column-rename drift the schema-only
// tests miss.
export const reviewModuleConfig: CoachModuleConfig<Input, AiOutput> = {
  moduleName: "review",
  requestSchema:
    requestSchema as unknown as CoachModuleConfig<Input, AiOutput>["requestSchema"],
  aiOutputSchema: reviewOutputSchema,
  personBehavior: "resolve",
  personDedup: "name_only",
  threadBehavior: "auto_link",
  derivedTable: "review_entries",
  derivedIdColumn: "review_entry_id",
  aiJsonColumn: "ai_reflection_json",
  headlineColumn: "ai_headline",
  aiVersionColumn: "ai_reflection_version",
  // Coins redesign Slice A 2026-05-29: bump 9 → 10. The lean form drops the
  // Quick/Full split + most SOT inputs, and the AI output shape changes from the
  // 4-base + 4-repair card set to the tier-aware {turning_point, pattern_data,
  // recommended_move (+ their_likely_experience, repeat_stop_update on Deep)}
  // set. Readers MUST gate on ai_reflection_version when distinguishing shape —
  // 10 = lean tiered, 9 = SOT Commit-5, ≤8 = older.
  aiVersionValue: 10,

  // Server-side authoritative lookup for the Prepare → Review link. Runs for
  // every lean Review (form-depth no longer gates calibration). Failure degrades
  // to no-link; never fails the request. Forces linkedPrepareEntryId to null
  // whenever the lookup finds no snapshot so a client cannot smuggle a foreign
  // Prepare UUID into the FK column — we only trust UUIDs from
  // findLinkedPrepareEntry (scoped by userId).
  prePromptEnrich: async (input, supabase, userId, personId) => {
    if (!personId) return { ...input, linkedPrepareEntryId: null };
    const snapshot = await findLinkedPrepareEntry(supabase, userId, personId);
    if (!snapshot) return { ...input, linkedPrepareEntryId: null };
    return {
      ...input,
      linkedPrepareEntryId: snapshot.prepareEntryId,
      prepareSnapshotForPrompt: {
        situation: snapshot.situation,
        predictedReaction: snapshot.predictedReaction,
        emotionAsData: snapshot.emotionAsData,
        hiddenExpectation: snapshot.hiddenExpectation,
        specificShift: snapshot.specificShift,
        outcomeFloor: snapshot.outcomeFloor,
        opener: snapshot.opener,
        primaryEmotion: snapshot.primaryEmotion,
        defaultPattern: snapshot.defaultPattern,
        neutralCheckQuestion: snapshot.neutralCheckQuestion,
      },
    };
  },

  buildPayloadFields: (input) => ({
    tier: input.tier,
    personName: input.personName,
    whatHappened: input.whatHappened,
    observedRaw: input.observedRaw,
    interpretedRaw: input.interpretedRaw,
    whatYouDid: input.whatYouDid,
    easierOrHarder: input.easierOrHarder,
    dataAndUpdate: input.dataAndUpdate,
    nextMove: input.nextMove,
    linkedPrepareEntryId: input.linkedPrepareEntryId ?? null,
  }),

  buildDerivedInsert: (input) => ({
    what_happened: input.whatHappened,
    observed_raw: input.observedRaw,
    interpreted_raw: input.interpretedRaw,
    what_you_did: input.whatYouDid,
    easier_or_harder: input.easierOrHarder,
    data_and_update: input.dataAndUpdate,
    next_move: input.nextMove,
    ai_tier: input.tier,
    // review_depth is deprecated (no more Quick/Full form split); ai_tier is the
    // tier of record. Left null on lean rows. ai_reflection_version (10) is the
    // authoritative shape selector.
    review_depth: null,
    // repair_branch_active is NOT NULL on the table; the lean Review has no
    // in-form repair branch, so always false. Repair is its own module now.
    repair_branch_active: false,
    linked_prepare_entry_id: input.linkedPrepareEntryId ?? null,
  }),

  buildPrompt: (input, profile, context) =>
    buildReviewPrompt({
      profile,
      tier: input.tier,
      personName: context.personName,
      personRelationship: context.personRelationship,
      whatHappened: input.whatHappened,
      observedRaw: input.observedRaw,
      interpretedRaw: input.interpretedRaw,
      whatYouDid: input.whatYouDid,
      easierOrHarder: input.easierOrHarder,
      dataAndUpdate: input.dataAndUpdate,
      nextMove: input.nextMove,
      linkedPrepareEntryId: input.linkedPrepareEntryId ?? null,
      prepareSnapshot: input.prepareSnapshotForPrompt ?? null,
    }),

  // Surface the derived review_entry_id so the result screen can attach
  // Accept/Edit/Not-true card edits (POST /api/coach/card-edit) to it.
  buildResponseExtras: (derivedEntryId) => ({ reviewEntryId: derivedEntryId }),
};

export async function POST(req: Request) {
  return runCoachModule(req, reviewModuleConfig);
}
