import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ProfileType, ObservationTag } from "@/types";

export type AppSupabase = SupabaseClient<Database>;

/** Per-module configuration that captures all differences between Prepare, Review, and Repair. */
export interface CoachModuleConfig<
  TInput extends Record<string, unknown>,
  TAiOutput extends { pattern_tag?: string },
> {
  /** Module identifier used in logs, rate-limit keys, and record_type. */
  moduleName: string;

  /** Zod schema for the full request body (including idempotencyKey). */
  requestSchema: z.ZodType<
    TInput & {
      idempotencyKey: string;
      personId?: string | null;
      personName?: string;
      threadId?: string | null;
    }
  >;

  /** Zod schema for AI output validation. */
  aiOutputSchema: z.ZodType<TAiOutput>;

  // -- Subscription --

  /** "free_one" = Prepare (one free use), "required" = Review/Repair. */
  subscriptionGate: "free_one" | "required";

  // -- Thread --

  /** "auto_create" = Prepare creates a new thread. "auto_link" = Review/Repair link to existing. */
  threadBehavior: "auto_create" | "auto_link";

  // -- Person dedup --

  /**
   * "name_and_relationship" = Prepare dedupes by name + relationship.
   * "name_only" = Review/Repair dedupe by name only (relationship defaults to "other").
   */
  personDedup: "name_and_relationship" | "name_only";

  // -- Derived table --

  derivedTable: "prepare_entries" | "review_entries" | "repair_entries";
  derivedIdColumn: string; // e.g. "prepare_entry_id"
  aiJsonColumn: string; // e.g. "ai_plan_json"
  aiVersionColumn: string; // e.g. "ai_plan_version"
  aiVersionValue: number;

  /** Build the payload_json.fields object for raw_records. */
  buildPayloadFields: (input: TInput) => Record<string, unknown>;

  /** Build the derived table insert row (excluding user_id, raw_record_id, person_id, thread_id, is_complete). */
  buildDerivedInsert: (input: TInput) => Record<string, unknown>;

  /** Build the AI prompt from input + profile. */
  buildPrompt: (
    input: TInput,
    profile: ProfileType,
  ) => { system: string; user: string };

  // -- Observation --

  observationConfidence: number;
  observationSource: "predictive" | "observed";
  extractorVersion: string;

  /** Build the supporting_evidence_json for the pattern observation. */
  buildSupportingEvidence: (
    aiOutput: TAiOutput,
    input: TInput,
  ) => Record<string, unknown>;

  // -- Response --

  /** Extra fields to include in the response beyond the standard ones. */
  buildResponseExtras: (derivedEntryId: string) => Record<string, unknown>;

  // -- Thread title (only used when threadBehavior === "auto_create") --

  /** Extract a short title string from the input for thread auto-create. */
  getThreadTitle?: (input: TInput) => string;

  // -- Post-success hook (e.g., markFreePrepareUsed) --

  onSuccess?: (
    supabase: AppSupabase,
    userId: string,
    context: { aiOutput: TAiOutput; freePrepareUsed: boolean },
  ) => Promise<void>;
}
