// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createPrepareSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
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

function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

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

  // 3. Rate limit per user.
  const rl = rateLimit(`prepare:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
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
      // Clean up the raw row we just wrote — otherwise a retry would pile up
      // orphan raw rows. Accept that the cleanup itself can fail; v0.
      await supabase
        .from("raw_records")
        .delete()
        .eq("user_id", user.id)
        .eq("raw_record_id", rawRecordId);
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
      // Entry still saved; client-returned aiOutput is authoritative for
      // display. Next insight pipeline pass will re-read from DB.
    }
  }

  return NextResponse.json({
    success: true,
    aiOutput,
    rawRecordId,
    aiFailureKind: aiOutput ? undefined : lastFailureKind,
    message: aiOutput
      ? undefined
      : "We couldn't generate coaching feedback this time. Your entry is saved — you can try again.",
  });
}
