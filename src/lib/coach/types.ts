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
  /** Module identifier used in logs, rate-limit keys, and record_type. MUST exactly match the value in the raw_records.record_type CHECK constraint. */
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

  // -- Person resolution --

  /**
   * "resolve" = run the person-resolution block (verify ownership of
   *   provided personId OR dedup-by-name → reuse OR insert new). Used by
   *   Prepare / Review / Repair which all attach an entry to a person.
   * "skip" = skip person resolution entirely; effectivePersonId stays
   *   null. Used by Before-You-Send (lint tool with no person concept).
   */
  personBehavior: "resolve" | "skip";

  /**
   * "name_and_relationship" = Prepare dedupes by name + relationship.
   * "name_only" = Review/Repair dedupe by name only (relationship defaults to "other").
   * Optional when personBehavior === "skip".
   */
  personDedup?: "name_and_relationship" | "name_only";

  // -- Thread --

  /**
   * "auto_create" = Prepare creates a new thread (gated by getThreadTitle).
   * "auto_link" = Review/Repair link to existing recent thread.
   * "none" = skip thread resolution entirely (BYS).
   */
  threadBehavior: "auto_create" | "auto_link" | "none";

  // -- Derived table --

  derivedTable:
    | "prepare_entries"
    | "review_entries"
    | "repair_entries"
    | "before_you_send_entries";
  derivedIdColumn: string;
  aiJsonColumn: string;
  aiVersionColumn: string;
  aiVersionValue: number;

  /** Build the payload_json.fields object for raw_records. */
  buildPayloadFields: (input: TInput) => Record<string, unknown>;

  /** Build the derived table insert row (excluding user_id, raw_record_id, person_id, thread_id, is_complete). */
  buildDerivedInsert: (input: TInput) => Record<string, unknown>;

  /**
   * Build the AI prompt from input + profile + per-request person context.
   *
   * `context.personName` / `context.personRelationship` are populated from
   * the persons row when run-module resolves a non-null effectivePersonId
   * (post step 7). Both are null when no person was resolved (BYS skip path
   * or a Review with no picked person). Modules that already collect the
   * relationship via their input form (Prepare A/B) can ignore context;
   * modules that don't (Review) consume it.
   */
  buildPrompt: (
    input: TInput,
    profile: ProfileType,
    context: { personName: string | null; personRelationship: string | null },
  ) => { system: string; user: string; prompt_version?: string };

  // -- Response --

  /** Extra fields to include in the response beyond the standard ones. */
  buildResponseExtras: (derivedEntryId: string) => Record<string, unknown>;

  // -- Thread title (only used when threadBehavior === "auto_create") --

  /** Extract a short title string from the input for thread auto-create. */
  getThreadTitle?: (input: TInput) => string;
}

/** Per-module configuration that captures all differences between Prepare, Review, Repair, and Before-You-Send. */
export type CoachModuleConfig<
  TInput extends Record<string, unknown>,
  TAiOutput extends Record<string, unknown>,
> = BaseCoachModuleConfig<TInput, TAiOutput> & SubscriptionGateConfig;
