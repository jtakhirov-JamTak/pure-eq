// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createReviewSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { reviewOutputSchema, validateAIOutput } from "@/lib/ai/schemas";
import { buildReviewPrompt } from "@/lib/ai/prompts";
import type { ProfileType } from "@/types";

export const runtime = "nodejs";

const MAX_RETRIES = 1;
const AI_REFLECTION_VERSION = 1;
const ANTHROPIC_TIMEOUT_MS = 30_000;

const PROFILE_VALUES: ProfileType[] = [
  "direct",
  "reflective",
  "warm",
  "measured",
  "perceptive",
  "intense",
];

const requestSchema = createReviewSchema.extend({
  idempotencyKey: z.string().uuid(),
});

type ReviewAiOutput = z.infer<typeof reviewOutputSchema>;

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
  const rl = rateLimit(`review:${user.id}`, { limit: 10, windowMs: 60_000 });
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
  //    onboarding — if we get here without a profile, fail loudly.
  const { data: profileRow, error: profileErr } = await supabase
    .from("user_profiles")
    .select("primary_profile")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileErr) {
    console.error("review: profile lookup failed", profileErr.code);
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
    console.error("review: unknown profile value");
    return NextResponse.json({ error: "Profile invalid" }, { status: 500 });
  }
  const userProfile = rawProfile as ProfileType;

  // 5. Idempotency.
  const { data: existingRaw, error: existingErr } = await supabase
    .from("raw_records")
    .select("raw_record_id")
    .eq("user_id", user.id)
    .eq("source_session_id", idempotencyKey)
    .maybeSingle();
  if (existingErr) {
    console.error("review: idempotency check failed", existingErr.code);
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
        record_type: "review",
        module_type: "review",
        source_session_id: idempotencyKey,
        payload_json: {
          fields: {
            whatHappened: input.whatHappened,
            hardestMomentFeeling: input.hardestMomentFeeling,
            observedInThem: input.observedInThem,
            theirExperience: input.theirExperience,
            whatHelped: input.whatHelped,
            whatHurt: input.whatHurt,
            validatedAssumptions: input.validatedAssumptions ?? null,
            unresolvedAndNext: input.unresolvedAndNext,
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
      console.error("review: raw_records insert failed", rawErr?.code);
      return NextResponse.json(
        { error: "Could not save entry" },
        { status: 500 }
      );
    }
    rawRecordId = rawInserted.raw_record_id;
  }

  // 6. Derived row FIRST with null reflection.
  const { data: existingDerived, error: derivedLookupErr } = await supabase
    .from("review_entries")
    .select("review_entry_id, ai_reflection_json")
    .eq("user_id", user.id)
    .eq("raw_record_id", rawRecordId)
    .maybeSingle();
  if (derivedLookupErr) {
    console.error("review: derived lookup failed", derivedLookupErr.code);
    return NextResponse.json(
      { error: "Could not save review entry" },
      { status: 500 }
    );
  }

  let reviewEntryId: string;
  if (existingDerived) {
    reviewEntryId = existingDerived.review_entry_id;
  } else {
    const { data: derivedInserted, error: derivedErr } = await supabase
      .from("review_entries")
      .insert({
        user_id: user.id,
        raw_record_id: rawRecordId,
        what_happened: input.whatHappened,
        hardest_moment_feeling: input.hardestMomentFeeling,
        observed_in_them: input.observedInThem,
        their_experience: input.theirExperience,
        what_helped: input.whatHelped,
        what_hurt: input.whatHurt,
        validated_assumptions: input.validatedAssumptions ?? null,
        unresolved_and_next: input.unresolvedAndNext,
        ai_reflection_json: null,
        ai_reflection_version: null,
        is_complete: false,
        person_id: input.personId ?? null,
        thread_id: input.threadId ?? null,
      })
      .select("review_entry_id")
      .single();

    if (derivedErr || !derivedInserted) {
      console.error("review: review_entries insert failed", derivedErr?.code);
      // Only clean up the raw row if WE inserted it in this request. If it
      // was reused from a prior attempt (existingRaw truthy), the user
      // already owns it — deleting would nuke a row we're about to retry.
      if (!existingRaw) {
        await supabase
          .from("raw_records")
          .delete()
          .eq("user_id", user.id)
          .eq("raw_record_id", rawRecordId);
      }
      return NextResponse.json(
        { error: "Could not save review entry" },
        { status: 500 }
      );
    }
    reviewEntryId = derivedInserted.review_entry_id;
  }

  // 7. Call Claude.
  const prompt = buildReviewPrompt({
    profile: userProfile,
    whatHappened: input.whatHappened,
    hardestMomentFeeling: input.hardestMomentFeeling,
    observedInThem: input.observedInThem,
    theirExperience: input.theirExperience,
    whatHelped: input.whatHelped,
    whatHurt: input.whatHurt,
    validatedAssumptions: input.validatedAssumptions ?? "",
    unresolvedAndNext: input.unresolvedAndNext,
  });

  const anthropic = new Anthropic({ timeout: ANTHROPIC_TIMEOUT_MS });
  let aiOutput: ReviewAiOutput | null = null;
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
      const validated = reviewOutputSchema.safeParse(jsonOutput);
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
      console.error(
        `review: AI attempt ${attempt + 1} failed kind=${lastFailureKind}`
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // 8. UPDATE derived row with the AI reflection.
  if (aiOutput) {
    const { error: updateErr } = await supabase
      .from("review_entries")
      .update({
        ai_reflection_json: aiOutput,
        ai_reflection_version: AI_REFLECTION_VERSION,
        is_complete: true,
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("review_entry_id", reviewEntryId);
    if (updateErr) {
      console.error("review: derived update failed", updateErr.code);
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
