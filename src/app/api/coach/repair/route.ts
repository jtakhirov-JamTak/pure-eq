// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createRepairSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { verifyPersonOwnership } from "@/lib/verify-ownership";
import { checkSubscription } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";
import { repairOutputSchema, validateAIOutput } from "@/lib/ai/schemas";
import { buildRepairPrompt } from "@/lib/ai/prompts";
import {
  OBSERVATION_TAG_DESCRIPTIONS,
  OBSERVATION_TYPE_FOR_TAG,
} from "@/lib/insights";
import type { ProfileType, ObservationTag } from "@/types";

export const runtime = "nodejs";

const MAX_RETRIES = 1;
const AI_STRATEGY_VERSION = 1;
const ANTHROPIC_TIMEOUT_MS = 30_000;

const PROFILE_VALUES: ProfileType[] = [
  "direct",
  "reflective",
  "warm",
  "measured",
  "perceptive",
  "intense",
];

const requestSchema = createRepairSchema.extend({
  idempotencyKey: z.string().uuid(),
  personName: z.string().trim().max(200).optional(),
});

type RepairAiOutput = z.infer<typeof repairOutputSchema>;

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

  // 2b. Subscription gate — Repair has no free tier. Admins bypass.
  if (!isAdmin(user.email)) {
    const access = await checkSubscription(supabase, user.id);
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: "Subscription required" },
        { status: 403 }
      );
    }
  }

  // 3. Rate limit per user.
  const rlMin = rateLimit(`repair:min:${user.id}`, { limit: 10, windowMs: 60_000 });
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
  const rlDay = rateLimit(`repair:day:${user.id}`, {
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

  // 4. Fetch the latest Profile Snapshot.
  const { data: profileRow, error: profileErr } = await supabase
    .from("user_profiles")
    .select("primary_profile")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileErr) {
    console.error("repair: profile lookup failed", profileErr.code);
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
    console.error("repair: unknown profile value");
    return NextResponse.json({ error: "Profile invalid" }, { status: 500 });
  }
  const userProfile = rawProfile as ProfileType;

  // 4b. Resolve person_id.
  let effectivePersonId: string | null = input.personId ?? null;
  if (effectivePersonId) {
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
    const { data: existingPerson } = await supabase
      .from("persons")
      .select("person_id")
      .eq("user_id", user.id)
      .eq("display_name", input.personName)
      .eq("is_active", true)
      .maybeSingle();

    if (existingPerson) {
      effectivePersonId = existingPerson.person_id;
      await supabase
        .from("persons")
        .update({ updated_at: new Date().toISOString() })
        .eq("person_id", effectivePersonId)
        .eq("user_id", user.id);
    } else {
      const { data: newPerson } = await supabase
        .from("persons")
        .insert({
          user_id: user.id,
          display_name: input.personName,
          relationship_domain: "other",
        })
        .select("person_id")
        .single();
      if (newPerson) {
        effectivePersonId = newPerson.person_id;
      }
    }
  }

  // 4c. Auto-link to most recent open thread for this person (< 7 days).
  let effectiveThreadId: string | null = input.threadId ?? null;
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

  // 5. Idempotency.
  const { data: existingRaw, error: existingErr } = await supabase
    .from("raw_records")
    .select("raw_record_id")
    .eq("user_id", user.id)
    .eq("source_session_id", idempotencyKey)
    .maybeSingle();
  if (existingErr) {
    console.error("repair: idempotency check failed", existingErr.code);
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
        record_type: "repair",
        module_type: "repair",
        source_session_id: idempotencyKey,
        payload_json: {
          fields: {
            whatNeedsRepair: input.whatNeedsRepair,
            yourResponsibility: input.yourResponsibility,
            theirNeed: input.theirNeed,
            desiredOutcome: input.desiredOutcome,
            channel: input.channel,
            timing: input.timing,
          },
          profile_used: userProfile,
        },
        schema_version: 1,
        is_complete: true,
        completed_at: new Date().toISOString(),
        person_id: effectivePersonId,
        thread_id: effectiveThreadId,
      })
      .select("raw_record_id")
      .single();

    if (rawErr || !rawInserted) {
      console.error("repair: raw_records insert failed", rawErr?.code);
      return NextResponse.json(
        { error: "Could not save entry" },
        { status: 500 }
      );
    }
    rawRecordId = rawInserted.raw_record_id;
  }

  // 6. Derived row FIRST with null strategy.
  const { data: existingDerived, error: derivedLookupErr } = await supabase
    .from("repair_entries")
    .select("repair_entry_id, ai_strategy_json")
    .eq("user_id", user.id)
    .eq("raw_record_id", rawRecordId)
    .maybeSingle();
  if (derivedLookupErr) {
    console.error("repair: derived lookup failed", derivedLookupErr.code);
    return NextResponse.json(
      { error: "Could not save repair entry" },
      { status: 500 }
    );
  }

  let repairEntryId: string;
  if (existingDerived) {
    repairEntryId = existingDerived.repair_entry_id;
  } else {
    const { data: derivedInserted, error: derivedErr } = await supabase
      .from("repair_entries")
      .insert({
        user_id: user.id,
        raw_record_id: rawRecordId,
        what_needs_repair: input.whatNeedsRepair,
        your_responsibility: input.yourResponsibility,
        their_need: input.theirNeed,
        desired_outcome: input.desiredOutcome,
        channel: input.channel,
        timing: input.timing,
        ai_strategy_json: null,
        ai_strategy_version: null,
        is_complete: false,
        person_id: effectivePersonId,
        thread_id: effectiveThreadId,
      })
      .select("repair_entry_id")
      .single();

    if (derivedErr || !derivedInserted) {
      console.error("repair: repair_entries insert failed", derivedErr?.code);
      if (!existingRaw) {
        await supabase
          .from("raw_records")
          .delete()
          .eq("user_id", user.id)
          .eq("raw_record_id", rawRecordId);
      }
      return NextResponse.json(
        { error: "Could not save repair entry" },
        { status: 500 }
      );
    }
    repairEntryId = derivedInserted.repair_entry_id;
  }

  // 7. Call Claude.
  const prompt = buildRepairPrompt({
    profile: userProfile,
    whatNeedsRepair: input.whatNeedsRepair,
    yourResponsibility: input.yourResponsibility,
    theirNeed: input.theirNeed,
    desiredOutcome: input.desiredOutcome,
    channel: input.channel,
    timing: input.timing,
  });

  const anthropic = new Anthropic({ timeout: ANTHROPIC_TIMEOUT_MS });
  let aiOutput: RepairAiOutput | null = null;
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
      const validated = repairOutputSchema.safeParse(jsonOutput);
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
        `repair: AI attempt ${attempt + 1} failed kind=${lastFailureKind}`
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // 8. UPDATE derived row with the AI strategy.
  let saveWarning = false;
  if (aiOutput) {
    const { error: updateErr } = await supabase
      .from("repair_entries")
      .update({
        ai_strategy_json: aiOutput,
        ai_strategy_version: AI_STRATEGY_VERSION,
        is_complete: true,
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("repair_entry_id", repairEntryId);
    if (updateErr) {
      console.error("repair: derived update failed", updateErr.code);
      saveWarning = true;
    }
  }

  // 9. Extract pattern observation (fire-and-forget).
  if (aiOutput?.pattern_tag) {
    try {
      const tag = aiOutput.pattern_tag as ObservationTag;
      const tagDesc = OBSERVATION_TAG_DESCRIPTIONS[tag];
      if (tagDesc) {
        const { data: existingObs } = await supabase
          .from("pattern_observations")
          .select("pattern_observation_id")
          .eq("user_id", user.id)
          .eq("source_raw_record_id", rawRecordId)
          .maybeSingle();

        if (!existingObs) {
          await supabase.from("pattern_observations").insert({
            user_id: user.id,
            source_raw_record_id: rawRecordId,
            source_interaction_entry_id: repairEntryId,
            person_id: effectivePersonId,
            thread_id: effectiveThreadId,
            observation_type: OBSERVATION_TYPE_FOR_TAG[tag],
            observation_tag: tag,
            direction: tagDesc.direction,
            confidence_score: 0.8,
            observation_source: "observed",
            extractor_version: "repair_v1",
            supporting_evidence_json: {
              repair_strategy: aiOutput.repair_strategy,
              desired_outcome: input.desiredOutcome,
            },
          });
        }
      }
    } catch {
      console.error("repair: pattern observation insert failed");
    }
  }

  return NextResponse.json({
    success: true,
    aiOutput,
    rawRecordId,
    repairEntryId,
    saveWarning,
    aiFailureKind: aiOutput ? undefined : lastFailureKind,
    message: aiOutput
      ? undefined
      : "We couldn't generate coaching feedback this time. Your entry is saved — you can try again.",
  });
}
