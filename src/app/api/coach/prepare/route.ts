// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createPrepareSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { prepareOutputSchema, validateAIOutput } from "@/lib/ai/schemas";
import { buildPreparePrompt } from "@/lib/ai/prompts";
import type { ProfileType } from "@/types";

export const runtime = "nodejs";

const MAX_RETRIES = 1; // one retry, not two — schema mismatches don't self-heal
const AI_PLAN_VERSION = 1;
const ANTHROPIC_TIMEOUT_MS = 30_000;

const PROFILE_VALUES: ProfileType[] = [
  "direct",
  "reflective",
  "warm",
  "measured",
  "perceptive",
  "intense",
];

const requestSchema = createPrepareSchema.extend({
  idempotencyKey: z.string().uuid(),
});

type PrepareAiOutput = z.infer<typeof prepareOutputSchema>;

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Parse + validate.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;
  const idempotencyKey = input.idempotencyKey;

  // 2. Auth.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 3. Rate limit per user. Two buckets: minute-window blocks burst abuse,
  //    day-window blocks slow cost-bleed against the paid Anthropic API.
  const rlMin = rateLimit(`prepare:min:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!rlMin.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rlMin.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }
  const rlDay = rateLimit(`prepare:day:${user.id}`, {
    limit: 50,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rlDay.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rlDay.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  // 4. Fetch the latest Profile Snapshot. Hub routes unfinished users through
  //    onboarding — if we get here without a profile, that's a real integrity
  //    break, fail loudly rather than silently personalizing with a default.
  const { data: profileRow, error: profileErr } = await supabase
    .from("user_profiles")
    .select("primary_profile")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileErr) {
    console.error("prepare: profile lookup failed", profileErr.code);
    return NextResponse.json({ error: "Could not load profile" }, { status: 500 });
  }
  if (!profileRow) {
    return NextResponse.json(
      { error: "Complete onboarding first" },
      { status: 409 }
    );
  }
  const rawProfile = profileRow.primary_profile;
  if (!(PROFILE_VALUES as string[]).includes(rawProfile)) {
    console.error("prepare: unknown profile value");
    return NextResponse.json({ error: "Profile invalid" }, { status: 500 });
  }
  const userProfile = rawProfile as ProfileType;

  // 5. Idempotency. The client sends a UUID once per submission attempt;
  //    on retry (network flake, strict-mode double-mount, user-initiated
  //    retry), the same key reuses any rows already written so we never
  //    create duplicate raw_records for a single logical submission.
  const { data: existingRaw, error: existingErr } = await supabase
    .from("raw_records")
    .select("raw_record_id")
    .eq("user_id", user.id)
    .eq("source_session_id", idempotencyKey)
    .maybeSingle();
  if (existingErr) {
    console.error("prepare: idempotency check failed", existingErr.code);
    return NextResponse.json({ error: "Could not save entry" }, { status: 500 });
  }

  let rawRecordId: string;
  if (existingRaw) {
    rawRecordId = existingRaw.raw_record_id;
  } else {
    const { data: rawInserted, error: rawErr } = await supabase
      .from("raw_records")
      .insert({
        user_id: user.id,
        record_type: "prepare",
        module_type: "prepare",
        source_session_id: idempotencyKey,
        payload_json: {
          fields: {
            personName: input.personName,
            relationship: input.relationship,
            situation: input.situation,
            desiredOutcome: input.desiredOutcome,
            primaryEmotion: input.primaryEmotion,
            defaultPattern: input.defaultPattern,
            otherPersonHypothesis: input.otherPersonHypothesis,
            realityCheckQuestion: input.realityCheckQuestion,
            triggerPlan: input.triggerPlan,
          },
          profile_used: userProfile,
        },
        schema_version: 1,
        is_complete: true,
        completed_at: new Date().toISOString(),
        person_id: input.personId ?? null,
        thread_id: input.threadId ?? null,
      })
      .select("raw_record_id")
      .single();

    if (rawErr || !rawInserted) {
      console.error("prepare: raw_records insert failed", rawErr?.code);
      return NextResponse.json(
        { error: "Could not save entry" },
        { status: 500 }
      );
    }
    rawRecordId = rawInserted.raw_record_id;
  }

  // 6. Derived row FIRST with null plan. Both source-of-truth and derived
  //    row exist BEFORE we spend any AI budget. If Claude later fails, the
  //    entry is still saved and the user can retry coaching from the same
  //    row. If this insert fails, we clean up the raw row.
  const { data: existingDerived, error: derivedLookupErr } = await supabase
    .from("prepare_entries")
    .select("prepare_entry_id, ai_plan_json")
    .eq("user_id", user.id)
    .eq("raw_record_id", rawRecordId)
    .maybeSingle();
  if (derivedLookupErr) {
    console.error(
      "prepare: derived lookup failed",
      derivedLookupErr.code
    );
    return NextResponse.json(
      { error: "Could not save prepare entry" },
      { status: 500 }
    );
  }

  let prepareEntryId: string;
  if (existingDerived) {
    prepareEntryId = existingDerived.prepare_entry_id;
  } else {
    const { data: derivedInserted, error: derivedErr } = await supabase
      .from("prepare_entries")
      .insert({
        user_id: user.id,
        raw_record_id: rawRecordId,
        situation_text: input.situation,
        desired_outcome: input.desiredOutcome,
        primary_value: input.primaryEmotion,
        ai_plan_json: null,
        ai_plan_version: null,
        is_complete: false,
        person_id: input.personId ?? null,
        thread_id: input.threadId ?? null,
      })
      .select("prepare_entry_id")
      .single();

    if (derivedErr || !derivedInserted) {
      console.error("prepare: prepare_entries insert failed", derivedErr?.code);
      // Only clean up the raw row if WE inserted it in this request. If it
      // was reused from a prior attempt, the user already owns it — deleting
      // would nuke a row we're about to retry against.
      if (!existingRaw) {
        await supabase
          .from("raw_records")
          .delete()
          .eq("user_id", user.id)
          .eq("raw_record_id", rawRecordId);
      }
      return NextResponse.json(
        { error: "Could not save prepare entry" },
        { status: 500 }
      );
    }
    prepareEntryId = derivedInserted.prepare_entry_id;
  }

  // 7. Call Claude. One retry for transient JSON/schema glitches. Timeout
  //    prevents a stuck socket from hanging the route past Vercel's 504.
  //    Client instance is lifted out of the loop.
  const prompt = buildPreparePrompt({
    profile: userProfile,
    personName: input.personName,
    relationship: input.relationship,
    situation: input.situation,
    desiredOutcome: input.desiredOutcome,
    primaryEmotion: input.primaryEmotion,
    defaultPattern: input.defaultPattern,
    otherPersonHypothesis: input.otherPersonHypothesis,
    realityCheckQuestion: input.realityCheckQuestion,
    triggerPlan: input.triggerPlan,
  });

  const anthropic = new Anthropic({ timeout: ANTHROPIC_TIMEOUT_MS });
  let aiOutput: PrepareAiOutput | null = null;
  let lastFailureKind = "none";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
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
      const validated = prepareOutputSchema.safeParse(jsonOutput);
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
    } catch {
      // Log only the kind of failure. Anthropic error messages can embed
      // prompt snippets — we deliberately don't propagate them.
      console.error(
        `prepare: AI attempt ${attempt + 1} failed kind=${lastFailureKind}`
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // 8. UPDATE derived row with the AI plan (or leave it null if Claude
  //    failed — user can retry coaching from the same raw row).
  let saveWarning = false;
  if (aiOutput) {
    const { error: updateErr } = await supabase
      .from("prepare_entries")
      .update({
        ai_plan_json: aiOutput,
        ai_plan_version: AI_PLAN_VERSION,
        is_complete: true,
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("prepare_entry_id", prepareEntryId);
    if (updateErr) {
      console.error("prepare: derived update failed", updateErr.code);
      // Client still shows the aiOutput in memory, but the DB row is
      // is_complete=false with null plan. Flag it so the client knows the
      // save is partial and the insights pipeline can re-derive later.
      saveWarning = true;
    }
  }

  return NextResponse.json({
    success: true,
    aiOutput,
    rawRecordId,
    saveWarning,
    aiFailureKind: aiOutput ? undefined : lastFailureKind,
    message: aiOutput
      ? undefined
      : "We couldn't generate coaching feedback this time. Your entry is saved — you can try again.",
  });
}
