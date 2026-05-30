import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ProfileType } from "@/types";

export type AppSupabase = SupabaseClient<Database>;

// Access model (Slice B coins): the per-module free_one subscription gate is
// gone. AI generation is gated on a coin balance (Quick 4 / Deep 6), reserved
// atomically in run-module right before the Anthropic call. Saving an entry
// (generateAi:false) is always free; only "Get AI feedback" debits. Admins
// bypass the debit. No `subscriptionGate` / `freeUsageField` on the config.

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
    | "before_you_send_entries"
    | "pulse_check_entries";
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

  /**
   * Optional pre-prompt enrichment hook. Runs after person + thread + person-
   * context resolution (post step 8b) but before the prompt is built. Lets
   * a module mutate `input` based on a server-side lookup that the client
   * couldn't authoritatively make (e.g. Review's `linked_prepare_entry_id`
   * + Prepare snapshot prepend).
   *
   * Returns the (possibly augmented) input. On error: log + Sentry capture
   * (cooldown-latched per the run-module pattern), return the original
   * input unchanged. The AI call is still useful without the enrichment;
   * a 500 here would erase the user's just-typed entry.
   */
  prePromptEnrich?: (
    input: TInput,
    supabase: AppSupabase,
    userId: string,
    effectivePersonId: string | null,
  ) => Promise<TInput>;

  /**
   * Optional: derive extra derived-table columns from the validated AI
   * output, merged into the step-13 update alongside the ai_json + version
   * stamp. Used by lean Prepare to copy the AI "Predicted Reaction" card
   * into the predicted_reaction column (its writer moved from a user input
   * to this AI card) so the Review calibration link keeps working unchanged.
   *
   * Only called when aiOutput is non-null. Implementations MUST handle the
   * refusal mode — return {} when the output isn't normal coaching.
   */
  extractDerivedFromAi?: (aiOutput: TAiOutput) => Record<string, unknown>;

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
> = BaseCoachModuleConfig<TInput, TAiOutput>;
