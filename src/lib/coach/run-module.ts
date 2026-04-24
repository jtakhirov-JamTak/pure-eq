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
import { checkSubscription, reserveFreeUse } from "@/lib/subscription";
import type { Json } from "@/types/database";
import { isAdmin } from "@/lib/admin";
import { validateAIOutput } from "@/lib/ai/schemas";
import type { ProfileType } from "@/types";
import type { CoachModuleConfig } from "./types";

const MAX_RETRIES = 1;
const ANTHROPIC_TIMEOUT_MS = 30_000;

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

  // 4. Subscription gate.
  // - Admins: bypass.
  // - Subscribed (hasAccess): always allow.
  // - Otherwise, "free_one" modules allow one free use per module within
  //   the 3-day free period. The actual atomic reservation happens at
  //   step 9b (after idempotency check, before any writes), which closes
  //   the parallel-request race. This gate is the cheap up-front filter.
  const adminUser = isAdmin(user.email);
  // Tracks whether this request needs to atomically reserve a free use.
  // Admins and subscribed users skip the reservation entirely.
  let needsReservation = false;
  if (!adminUser) {
    const access = await checkSubscription(user.id);
    if (config.subscriptionGate === "free_one") {
      const freeFieldUsed = access[config.freeUsageField];
      const canUseFree = access.freePeriodActive && !freeFieldUsed;
      if (!access.hasAccess && !canUseFree) {
        return NextResponse.json({ error: "Subscription required" }, { status: 403 });
      }
      needsReservation = !access.hasAccess;
    } else {
      if (!access.hasAccess) {
        return NextResponse.json({ error: "Subscription required" }, { status: 403 });
      }
    }
  }

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
  const prompt = config.buildPrompt(input as TInput, userProfile);

  let rawRecordId: string;
  if (existingRaw) {
    rawRecordId = existingRaw.raw_record_id;
  } else {
    // 9b. Atomic free-use reservation — only on first attempt (not retries).
    // Closes the race where N parallel first-attempts all see "free not
    // used" at step 4 and all proceed. The UPDATE is atomic: only the
    // first concurrent request flips free_X_used_at from null to a
    // timestamp. Losers get a 403 here, before any writes happen.
    //
    // Does NOT revert on later failure. The idempotency key lets the
    // user retry (hitting the existingRaw branch above), so a failed AI
    // call doesn't burn a second free use.
    if (needsReservation && config.subscriptionGate === "free_one") {
      const result = await reserveFreeUse(user.id, config.freeUsageField);
      if (result === "already_used") {
        return NextResponse.json({ error: "Subscription required" }, { status: 403 });
      }
    }

    // Thread auto-create (write) stays inside idempotency guard.
    if (config.threadBehavior === "auto_create") {
      if (!effectiveThreadId && effectivePersonId && config.getThreadTitle) {
        const title = config.getThreadTitle(input as TInput);
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
          fields: config.buildPayloadFields(input as TInput),
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
  if (derivedLookup.data) {
    derivedEntryId = (derivedLookup.data as Record<string, string>)[config.derivedIdColumn];
  } else {
    const derivedRow = {
      user_id: user.id,
      raw_record_id: rawRecordId,
      ...config.buildDerivedInsert(input as TInput),
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
        validateAIOutput(validated.data);
      } catch {
        lastFailureKind = "banned_phrase";
        throw new Error("banned phrase");
      }
      aiOutput = validated.data;
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
  }

  // 13. Update derived row with AI output.
  let saveWarning = false;
  if (aiOutput) {
    const updateResult = await (supabase.from(config.derivedTable) as ReturnType<typeof supabase.from>)
      .update({
        [config.aiJsonColumn]: aiOutput,
        [config.aiVersionColumn]: config.aiVersionValue,
        is_complete: true,
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq(config.derivedIdColumn, derivedEntryId);

    if (updateResult.error) {
      console.error(`${name}: derived update failed`, updateResult.error.code);
      saveWarning = true;
    }
  }

  // 14. Response.
  return NextResponse.json({
    success: true,
    aiOutput,
    rawRecordId,
    ...config.buildResponseExtras(derivedEntryId),
    saveWarning,
    aiFailureKind: aiOutput ? undefined : lastFailureKind,
    message: aiOutput
      ? undefined
      : "We couldn't generate coaching feedback this time. Your entry is saved — you can try again.",
  });
}
