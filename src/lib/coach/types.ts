import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ProfileType } from "@/types";
import type { FreeUsageField } from "@/lib/subscription";

export type AppSupabase = SupabaseClient<Database>;

/**
 * Subscription gate config — discriminated union so TypeScript requires
 * `freeUsageField` when `subscriptionGate === "free_one"`. Prevents the
 * "silent default to freePrepareUsed" footgun if a future module is
 * added without specifying which free-use column to check.
 */
type SubscriptionGateConfig =
  | { subscriptionGate: "free_one"; freeUsageField: FreeUsageField }
  | { subscriptionGate: "required"; freeUsageField?: never };

interface BaseCoachModuleConfig<
  TInput extends Record<string, unknown>,
  TAiOutput extends Record<string, unknown>,
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
  derivedIdColumn: string;
  aiJsonColumn: string;
  aiVersionColumn: string;
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

  // -- Response --

  /** Extra fields to include in the response beyond the standard ones. */
  buildResponseExtras: (derivedEntryId: string) => Record<string, unknown>;

  // -- Thread title (only used when threadBehavior === "auto_create") --

  /** Extract a short title string from the input for thread auto-create. */
  getThreadTitle?: (input: TInput) => string;
}

/** Per-module configuration that captures all differences between Prepare, Review, and Repair. */
export type CoachModuleConfig<
  TInput extends Record<string, unknown>,
  TAiOutput extends Record<string, unknown>,
> = BaseCoachModuleConfig<TInput, TAiOutput> & SubscriptionGateConfig;
