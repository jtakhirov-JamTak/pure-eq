// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createPrepareSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { prepareOutputSchema, validateAIOutput } from "@/lib/ai/schemas";
import { buildPreparePrompt } from "@/lib/ai/prompts";
import type { ProfileType } from "@/types";

export const runtime = "nodejs";

const MAX_RETRIES = 2;
const AI_PLAN_VERSION = 1;

const PROFILE_VALUES: ProfileType[] = [
  "direct",
  "reflective",
  "warm",
  "measured",
  "perceptive",
  "intense",
];

function asProfileType(v: string | null | undefined): ProfileType {
  return v && (PROFILE_VALUES as string[]).includes(v)
    ? (v as ProfileType)
    : "reflective";
}

export async function POST(req: Request) {
  // 1. Parse + validate.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createPrepareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

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

  // 4. Fetch the latest Profile Snapshot for personalization. Append-only
  //    table — ORDER BY created_at DESC LIMIT 1. Safe default if the user
  //    somehow bypassed onboarding (shouldn't happen, hub routes them first).
  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("primary_profile")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const userProfile = asProfileType(profileRow?.primary_profile);

  // 5. Source of truth first: raw_records with full fidelity of user input.
  const { data: rawInserted, error: rawErr } = await supabase
    .from("raw_records")
    .insert({
      user_id: user.id,
      record_type: "prepare",
      module_type: "prepare",
      source_session_id: crypto.randomUUID(),
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
        inputModes: input.inputModes ?? {},
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

  // 6. Call Claude with retries. AI failure is non-fatal: the entry is
  //    already saved, we return aiOutput: null and let the UI tell the user.
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

  let aiOutput: Record<string, string> | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const client = new Anthropic();
      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("no text block");
      }
      const raw = textBlock.text.replace(/```json\n?|```/g, "").trim();
      const jsonOutput = JSON.parse(raw);
      const validated = prepareOutputSchema.safeParse(jsonOutput);
      if (!validated.success) throw new Error("schema mismatch");
      validateAIOutput(validated.data);
      aiOutput = validated.data;
      break;
    } catch (err) {
      console.error(
        `prepare: AI attempt ${attempt + 1} failed`,
        (err as Error).message
      );
    }
  }

  // 7. Derived row. FK to raw_record. On failure, clean up the orphan raw
  //    row — no Postgres transaction available from the JS client, this is
  //    the approved v0 pattern (see onboarding/submit).
  const { error: derivedErr } = await supabase.from("prepare_entries").insert({
    user_id: user.id,
    raw_record_id: rawInserted.raw_record_id,
    situation_text: input.situation,
    desired_outcome: input.desiredOutcome,
    primary_value: input.primaryEmotion,
    ai_plan_json: aiOutput,
    ai_plan_version: aiOutput ? AI_PLAN_VERSION : null,
    is_complete: !!aiOutput,
    completed_at: new Date().toISOString(),
    person_id: input.personId ?? null,
    thread_id: input.threadId ?? null,
  });

  if (derivedErr) {
    console.error("prepare: prepare_entries insert failed", derivedErr.code);
    await supabase
      .from("raw_records")
      .delete()
      .eq("raw_record_id", rawInserted.raw_record_id);
    return NextResponse.json(
      { error: "Could not save prepare entry" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    aiOutput,
    rawRecordId: rawInserted.raw_record_id,
    message: aiOutput
      ? undefined
      : "Your entry is saved. Coaching feedback wasn't available this time — your notes still contribute to your insights.",
  });
}
