// Shared pipeline for all Coach modules (Prepare, Review, Repair).
// Each route passes a CoachModuleConfig that captures its specific
// differences. This file contains the ~280-line shared logic that
// was previously copy-pasted across 3 x ~440-line route files.

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { verifyPersonOwnership } from "@/lib/verify-ownership";
import {
  spendCoins,
  refundCoins,
  costForTier,
  getBalance,
  nextGenerationAttempt,
  generationSpendKey,
} from "@/lib/coins";
import type { Json } from "@/types/database";
import { isAdmin } from "@/lib/admin";
import { isAIDisabled } from "@/lib/kill-switch";
import { validateAIOutput } from "@/lib/ai/schemas";
import type { AiTier, ProfileType } from "@/types";
import type { CoachModuleConfig } from "./types";

const MAX_RETRIES = 1;
const ANTHROPIC_TIMEOUT_MS = 30_000;

// Cooldown-latched Sentry capture for the post-resolution person-context
// fetch. If RLS misconfigures or the persons table schema drifts, every
// Review submission silently degrades to a no-context prompt — without
// the latch, a busy outage emits thousands of events per minute and
// blows the quota that would have surfaced the real signal. Module-
// scoped (not request-scoped) per the rate-limit.ts pattern.
const PERSON_FETCH_CAPTURE_COOLDOWN_MS = 5 * 60 * 1000;
let lastPersonFetchCaptureAt = 0;

const PROFILE_VALUES: ProfileType[] = [
  "direct",
  "reflective",
  "warm",
  "measured",
  "perceptive",
  "intense",
];

export async function runCoachModule<
  TInput extends Record<string, unknown>,
  TAiOutput extends Record<string, unknown>,
>(
  req: Request,
  config: CoachModuleConfig<TInput, TAiOutput>,
): Promise<NextResponse> {
  const name = config.moduleName;

  // 1. Origin check.
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Parse + validate.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = config.requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;
  const idempotencyKey = input.idempotencyKey;

  // 3. Auth.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 4. Access model (Slice B coins). No up-front subscription/free-use gate:
  //    - Saving an entry (generateAi:false) is always free.
  //    - "Get AI feedback" (generateAi:true) reserves coins atomically right
  //      before the Anthropic call (step 12), so the cost is charged only when
  //      we actually generate, and the entry is always saved first regardless
  //      of balance. Admins bypass the debit entirely.
  //    generateAi defaults to TRUE so an un-migrated combined-submit client
  //    (save + AI in one call) keeps working during the page migration window.
  const adminUser = isAdmin(user.email);
  const generateAi = (input as { generateAi?: boolean }).generateAi ?? true;
  const tier: AiTier =
    (input as { tier?: AiTier }).tier === "deep" ? "deep" : "quick";
  const coinCost = costForTier(tier);

  // 5. Rate limit — two buckets.
  const rlMin = await rateLimit(`${name}:min:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!rlMin.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rlMin.resetAt - Date.now()) / 1000)) } },
    );
  }
  const rlDay = await rateLimit(`${name}:day:${user.id}`, { limit: 50, windowMs: 24 * 60 * 60 * 1000 });
  if (!rlDay.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rlDay.resetAt - Date.now()) / 1000)) } },
    );
  }

  // 6. Fetch profile.
  const { data: profileRow, error: profileErr } = await supabase
    .from("user_profiles")
    .select("primary_profile")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileErr) {
    console.error(`${name}: profile lookup failed`, profileErr.code);
    return NextResponse.json({ error: "Could not load profile" }, { status: 500 });
  }
  if (!profileRow) {
    return NextResponse.json({ error: "Complete onboarding first" }, { status: 409 });
  }
  const rawProfile = profileRow.primary_profile;
  if (!(PROFILE_VALUES as string[]).includes(rawProfile)) {
    console.error(`${name}: unknown profile value`);
    return NextResponse.json({ error: "Profile invalid" }, { status: 500 });
  }
  const userProfile = rawProfile as ProfileType;

  // 7. Resolve person_id.
  // Skip the entire block when personBehavior === "skip" (used by
  // Before-You-Send, which has no person concept). effectivePersonId
  // stays null and downstream insert paths write null person_id.
  let effectivePersonId: string | null = input.personId ?? null;
  if (config.personBehavior === "skip") {
    effectivePersonId = null;
  } else if (effectivePersonId) {
    const owns = await verifyPersonOwnership(supabase, user.id, effectivePersonId);
    if (!owns) {
      return NextResponse.json({ error: "Invalid person" }, { status: 400 });
    }
    await supabase
      .from("persons")
      .update({ updated_at: new Date().toISOString() })
      .eq("person_id", effectivePersonId)
      .eq("user_id", user.id);
  } else if (input.personName) {
    // Dedup: reuse existing person before creating.
    const personQuery = supabase
      .from("persons")
      .select("person_id")
      .eq("user_id", user.id)
      .eq("display_name", input.personName)
      .eq("is_active", true);

    // Prepare dedupes by name + relationship; Review/Repair by name only.
    if (config.personDedup === "name_and_relationship" && "relationship" in input) {
      personQuery.eq("relationship_domain", input.relationship as string);
    }

    const { data: existingPerson } = await personQuery.maybeSingle();

    if (existingPerson) {
      effectivePersonId = existingPerson.person_id;
      await supabase
        .from("persons")
        .update({ updated_at: new Date().toISOString() })
        .eq("person_id", effectivePersonId)
        .eq("user_id", user.id);
    } else {
      const relationship =
        config.personDedup === "name_and_relationship" && "relationship" in input
          ? (input.relationship as string)
          : "other";
      const { data: newPerson } = await supabase
        .from("persons")
        .insert({
          user_id: user.id,
          display_name: input.personName,
          relationship_domain: relationship,
        })
        .select("person_id")
        .single();
      if (newPerson) {
        effectivePersonId = newPerson.person_id;
      }
    }
  }

  // 8. Resolve thread.
  // Auto-link (read-only: find existing thread) runs before idempotency so
  // retries still get a thread_id. Auto-create (write: make a new thread)
  // stays inside the idempotency guard per the side-effects lesson.
  // threadBehavior === "none" (BYS) skips entirely; effectiveThreadId
  // stays null and the auto_create branch at step 9b is also no-op.
  let effectiveThreadId: string | null = input.threadId ?? null;
  if (config.threadBehavior === "none") {
    effectiveThreadId = null;
  } else if (config.threadBehavior === "auto_link") {
    // Review/Repair: auto-link to most recent open thread < 7 days.
    if (!effectiveThreadId && effectivePersonId) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentThread } = await supabase
        .from("conversation_threads")
        .select("thread_id")
        .eq("user_id", user.id)
        .eq("person_id", effectivePersonId)
        .eq("status", "open")
        .gte("last_activity_at", sevenDaysAgo)
        .order("last_activity_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentThread) {
        effectiveThreadId = recentThread.thread_id;
        await supabase
          .from("conversation_threads")
          .update({ last_activity_at: new Date().toISOString() })
          .eq("thread_id", effectiveThreadId)
          .eq("user_id", user.id);
      }
    }
  }

  // 8b. Fetch person context (display_name + relationship_domain) for
  // any module that wants to ground coaching in the relationship type.
  // Single lookup keyed on effectivePersonId — covers both client-provided
  // personId (verified at step 7) and name-deduped/inserted ids. Lives
  // after step 8 (thread resolution) because nothing in step 8 needs the
  // person row, and keeping all post-resolution lookups together is
  // easier to reason about than interleaving them with step 7's branches.
  //
  // On fetch error, degrade to no-context prompt rather than failing the
  // whole submission — the AI call is still useful without person
  // context, and a 500 here would erase the user's just-typed Review.
  // BUT: latch a Sentry capture so an RLS misconfig / schema rename
  // doesn't silently strip person context from every Review with zero
  // signal (CLAUDE.md "Latch captures in per-request fallback paths").
  let personName: string | null = null;
  let personRelationship: string | null = null;
  if (effectivePersonId) {
    const { data: personRow, error: personFetchErr } = await supabase
      .from("persons")
      .select("display_name, relationship_domain")
      .eq("person_id", effectivePersonId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (personFetchErr) {
      console.error(`${name}: person context fetch failed`, personFetchErr.code);
      const now = Date.now();
      if (now - lastPersonFetchCaptureAt >= PERSON_FETCH_CAPTURE_COOLDOWN_MS) {
        lastPersonFetchCaptureAt = now;
        Sentry.captureException(personFetchErr, {
          tags: { area: "coach", module: name, kind: "person_context_fetch_failed" },
        });
      }
    } else if (personRow) {
      personName = personRow.display_name;
      personRelationship = personRow.relationship_domain;
    }
  }

  // 8c. Optional pre-prompt enrichment hook. Lets a module augment its
  // input with a server-side lookup (e.g. Review's linked_prepare_entry_id
  // + Prepare snapshot prepend) before the prompt is built. Errors degrade
  // to no-enrichment + cooldown-latched Sentry, NOT request failure. Same
  // shape as the person-context fetch above.
  let enrichedInput = input as TInput;
  if (config.prePromptEnrich) {
    try {
      enrichedInput = await config.prePromptEnrich(
        input as TInput,
        supabase,
        user.id,
        effectivePersonId,
      );
    } catch (err) {
      console.error(`${name}: prePromptEnrich failed`);
      const now = Date.now();
      if (now - lastPersonFetchCaptureAt >= PERSON_FETCH_CAPTURE_COOLDOWN_MS) {
        lastPersonFetchCaptureAt = now;
        Sentry.captureException(err, {
          tags: { area: "coach", module: name, kind: "pre_prompt_enrich_failed" },
        });
      }
    }
  }

  // 9. Idempotency check.
  const { data: existingRaw, error: existingErr } = await supabase
    .from("raw_records")
    .select("raw_record_id")
    .eq("user_id", user.id)
    .eq("source_session_id", idempotencyKey)
    .maybeSingle();
  if (existingErr) {
    console.error(`${name}: idempotency check failed`, existingErr.code);
    return NextResponse.json({ error: "Could not save entry" }, { status: 500 });
  }

  // Build the prompt once. Needed for step 10 (persist prompt_version
  // into payload_json) AND step 12 (the actual AI call). buildPrompt is
  // pure / cheap; building it before the idempotency branch keeps both
  // the new-row write path and the retry path on the same prompt object.
  // Passes `enrichedInput` (post-prePromptEnrich) so server-side lookups
  // land in the prompt.
  const prompt = config.buildPrompt(enrichedInput, userProfile, {
    personName,
    personRelationship,
  });

  let rawRecordId: string;
  if (existingRaw) {
    rawRecordId = existingRaw.raw_record_id;
  } else {
    // Thread auto-create (write) stays inside idempotency guard.
    if (config.threadBehavior === "auto_create") {
      if (!effectiveThreadId && effectivePersonId && config.getThreadTitle) {
        const title = config.getThreadTitle(enrichedInput);
        const { data: newThread, error: threadErr } = await supabase
          .from("conversation_threads")
          .insert({
            user_id: user.id,
            person_id: effectivePersonId,
            title,
            status: "open",
            last_activity_at: new Date().toISOString(),
          })
          .select("thread_id")
          .single();
        if (newThread) {
          effectiveThreadId = newThread.thread_id;
        } else if (threadErr) {
          console.error(`${name}: thread creation failed`, threadErr.code);
        }
      }
    }

    // 10. Insert raw_records.
    // Persist prompt_version into payload_json (closes Pure_EQ_Final.txt
    // §1596 — every Coach output should be traceable to the prompt
    // revision that produced it).
    const { data: rawInserted, error: rawErr } = await supabase
      .from("raw_records")
      .insert({
        user_id: user.id,
        record_type: name,
        module_type: name,
        source_session_id: idempotencyKey,
        payload_json: {
          fields: config.buildPayloadFields(enrichedInput),
          profile_used: userProfile,
          prompt_version: prompt.prompt_version ?? null,
        } as unknown as Json,
        schema_version: 1,
        is_complete: true,
        completed_at: new Date().toISOString(),
        person_id: effectivePersonId,
        thread_id: effectiveThreadId,
      })
      .select("raw_record_id")
      .single();

    if (rawErr || !rawInserted) {
      console.error(`${name}: raw_records insert failed`, rawErr?.code);
      return NextResponse.json({ error: "Could not save entry" }, { status: 500 });
    }
    rawRecordId = rawInserted.raw_record_id;
  }

  // 11. Derived row — insert with null AI output first.
  // Use type assertion for dynamic table access.
  const derivedLookup = await (supabase.from(config.derivedTable) as ReturnType<typeof supabase.from>)
    .select(`${config.derivedIdColumn}, ${config.aiJsonColumn}`)
    .eq("user_id", user.id)
    .eq("raw_record_id", rawRecordId)
    .maybeSingle();

  if (derivedLookup.error) {
    console.error(`${name}: derived lookup failed`, derivedLookup.error.code);
    return NextResponse.json({ error: `Could not save ${name} entry` }, { status: 500 });
  }

  let derivedEntryId: string;
  // The AI output already persisted on this entry, if any. Non-null means a
  // prior "Get AI feedback" succeeded — used below to short-circuit a repeat
  // generate (no re-charge, no re-call).
  let existingAiJson: unknown = null;
  if (derivedLookup.data) {
    const row = derivedLookup.data as Record<string, unknown>;
    derivedEntryId = row[config.derivedIdColumn] as string;
    existingAiJson = row[config.aiJsonColumn] ?? null;
  } else {
    const derivedRow = {
      user_id: user.id,
      raw_record_id: rawRecordId,
      ...config.buildDerivedInsert(enrichedInput),
      [config.aiJsonColumn]: null,
      [config.aiVersionColumn]: null,
      is_complete: false,
      person_id: effectivePersonId,
      thread_id: effectiveThreadId,
    };

    const derivedInsert = await (supabase.from(config.derivedTable) as ReturnType<typeof supabase.from>)
      .insert(derivedRow)
      .select(config.derivedIdColumn)
      .single();

    if (derivedInsert.error || !derivedInsert.data) {
      console.error(`${name}: ${config.derivedTable} insert failed`, derivedInsert.error?.code);
      if (!existingRaw) {
        await supabase
          .from("raw_records")
          .delete()
          .eq("user_id", user.id)
          .eq("raw_record_id", rawRecordId);
      }
      return NextResponse.json({ error: `Could not save ${name} entry` }, { status: 500 });
    }
    derivedEntryId = (derivedInsert.data as Record<string, string>)[config.derivedIdColumn];
  }

  // 11b. Save-vs-generate split (Slice B coins). The entry is now persisted
  // (free). If the caller only asked to SAVE, stop here — no AI, no debit.
  if (!generateAi) {
    return NextResponse.json({
      success: true,
      saved: true,
      aiOutput: null,
      rawRecordId,
      ...config.buildResponseExtras(derivedEntryId),
    });
  }

  // Already generated for this entry (a prior "Get AI feedback" succeeded):
  // return the cached output without re-charging or re-calling the model.
  if (existingAiJson) {
    return NextResponse.json({
      success: true,
      aiOutput: existingAiJson,
      rawRecordId,
      ...config.buildResponseExtras(derivedEntryId),
      cached: true,
    });
  }

  // 11b-kill. AI kill switch (DISABLE_AI). The entry is already saved for free
  // above; we only refuse the paid generation. No coins are reserved. A cached
  // output (the existingAiJson short-circuit above) still serves — flipping the
  // switch never costs anything, so there's nothing to gate there. Mirror the
  // AI-failure response shape so the client lands on its saved-but-no-coaching
  // screen with a retry, distinguished by aiFailureKind "disabled".
  if (isAIDisabled()) {
    return NextResponse.json({
      success: true,
      aiOutput: null,
      rawRecordId,
      ...config.buildResponseExtras(derivedEntryId),
      coinsSpent: 0,
      saveWarning: false,
      aiFailureKind: "disabled",
      message:
        "Coaching feedback is paused for maintenance right now. Your entry is saved — please try again later.",
    });
  }

  // 11c. Reserve coins for the generation (admins bypass). Keyed on a
  // per-attempt spend key (`idempotencyKey:gen:<n>`) so a double-tapped "Get AI
  // feedback" never double-charges (reserve-at-start, unique index dedups the
  // same attempt) WHILE a genuine retry after a failed+refunded generation gets
  // a fresh key and charges again — closing the retry leak where a same-key
  // retry hit 'already_applied' and generated free. On AI failure we refund the
  // same spend key below (release). On insufficient balance the entry is already
  // saved — the client surfaces an inline top-up rather than losing the work.
  let coinsCharged = false;
  let spendKey: string | null = null;
  if (!adminUser) {
    const attempt = await nextGenerationAttempt(user.id, idempotencyKey);
    spendKey = generationSpendKey(idempotencyKey, attempt);
    const reason = tier === "deep" ? "debit_deep" : "debit_quick";
    const spend = await spendCoins(user.id, coinCost, reason, spendKey);
    if (spend === "insufficient") {
      const balance = await getBalance(user.id);
      return NextResponse.json(
        {
          error: "insufficient_coins",
          needed: coinCost,
          balance,
          ...config.buildResponseExtras(derivedEntryId),
        },
        { status: 402 },
      );
    }
    if (spend === "invalid") {
      // Unexpected RPC failure (already logged + captured in spendCoins). The
      // entry is saved; don't run a generation we couldn't charge for.
      return NextResponse.json(
        { error: "Could not start feedback. Try again in a moment." },
        { status: 500 },
      );
    }
    // 'ok' = freshly charged this request → refund on AI failure (below).
    // 'already_applied' = a prior attempt charged under this key (retry after
    // a failed+refunded run); proceed without a second charge.
    coinsCharged = spend === "ok";
  }

  // 12. Call Claude. Reuses the prompt built before the idempotency branch.
  const anthropic = new Anthropic({ timeout: ANTHROPIC_TIMEOUT_MS });
  let aiOutput: TAiOutput | null = null;
  let lastFailureKind = "none";
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        // Sonnet 4.6: thinking off + effort high. Explicit because Sonnet 4.6
        // defaults have shifted across SDK versions; pinning preserves the
        // instruction-following behavior our prompts are tuned against.
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        thinking: { type: "disabled" },
        output_config: { effort: "high" },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        lastFailureKind = "no_text";
        throw new Error("no text block");
      }
      const raw = textBlock.text.replace(/```json\n?|```/g, "").trim();
      let jsonOutput: unknown;
      try {
        jsonOutput = JSON.parse(raw);
      } catch {
        lastFailureKind = "json_parse";
        throw new Error("bad json");
      }
      const validated = config.aiOutputSchema.safeParse(jsonOutput);
      if (!validated.success) {
        lastFailureKind = "schema_mismatch";
        throw new Error("schema mismatch");
      }
      try {
        aiOutput = validateAIOutput(validated.data);
      } catch {
        lastFailureKind = "banned_phrase";
        throw new Error("banned phrase");
      }
      lastFailureKind = "none";
      break;
    } catch (err) {
      lastErr = err;
      console.error(`${name}: AI attempt ${attempt + 1} failed kind=${lastFailureKind}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  if (!aiOutput) {
    Sentry.captureException(lastErr, {
      tags: { area: "coach", module: name, kind: lastFailureKind },
    });
    // Release the reservation: the generation failed before any output was
    // saved (reserve → refund). Only when we actually charged THIS request —
    // an 'already_applied' retry must not trigger a spurious credit. The
    // refund is idempotent (keyed off the per-attempt spendKey), so a repeat
    // failure on the same key won't stack credits, and the refund row is what
    // nextGenerationAttempt counts to advance the next retry's key.
    if (coinsCharged && spendKey) {
      await refundCoins(user.id, coinCost, spendKey);
    }
  }

  // 13. Update derived row with AI output.
  // extractDerivedFromAi (optional) promotes fields out of the AI output
  // into their own derived columns — e.g. lean Prepare copies the AI
  // Predicted Reaction card into predicted_reaction so Review calibration
  // reads it. Merged into the same update so the column + ai_json land
  // atomically.
  let saveWarning = false;
  if (aiOutput) {
    const derivedFromAi = config.extractDerivedFromAi
      ? config.extractDerivedFromAi(aiOutput)
      : {};
    const updateResult = await (supabase.from(config.derivedTable) as ReturnType<typeof supabase.from>)
      .update({
        [config.aiJsonColumn]: aiOutput,
        [config.aiVersionColumn]: config.aiVersionValue,
        ...derivedFromAi,
        is_complete: true,
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq(config.derivedIdColumn, derivedEntryId);

    if (updateResult.error) {
      console.error(`${name}: derived update failed`, updateResult.error.code);
      saveWarning = true;
      // The AI output was generated but couldn't be persisted to the derived
      // row — it isn't saved to the user's history. Treat this like an AI
      // failure for billing: release the hold (reserve → refund), symmetric
      // with the AI-failure refund above and the Insights insert-failure path.
      // The user still sees this run's output once in the response; a retry
      // (existingAiJson is still null, so it regenerates) gets a fresh spend
      // key via nextGenerationAttempt and charges for the run that actually
      // persists. Idempotent on the per-attempt key. Clearing coinsCharged
      // makes coinsSpent below net to 0 for this stranded run.
      if (coinsCharged && spendKey) {
        await refundCoins(user.id, coinCost, spendKey);
        coinsCharged = false;
      }
    }
  }

  // 14. Response.
  return NextResponse.json({
    success: true,
    aiOutput,
    rawRecordId,
    ...config.buildResponseExtras(derivedEntryId),
    // Net coins spent: the cost only when we charged AND produced output. A
    // charged-then-failed run was refunded above, so it nets to 0.
    coinsSpent: aiOutput && coinsCharged ? coinCost : 0,
    saveWarning,
    aiFailureKind: aiOutput ? undefined : lastFailureKind,
    message: aiOutput
      ? undefined
      : "We couldn't generate coaching feedback this time. Your entry is saved — you can try again.",
  });
}
