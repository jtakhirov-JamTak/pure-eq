// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createReviewSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { verifyPersonOwnership } from "@/lib/verify-ownership";
import { checkSubscription } from "@/lib/subscription";
import { isAdmin } from "@/lib/admin";
import { reviewOutputSchema, validateAIOutput } from "@/lib/ai/schemas";
import { buildReviewPrompt } from "@/lib/ai/prompts";
import {
  OBSERVATION_TAG_DESCRIPTIONS,
  OBSERVATION_TYPE_FOR_TAG,
} from "@/lib/insights";
import type { ProfileType, ObservationTag } from "@/types";

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
  // Person picker sends personName for display — not used by Review route
  // but included in the request body from the form's data spread.
  personName: z.string().max(200).optional(),
});

type ReviewAiOutput = z.infer<typeof reviewOutputSchema>;

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

  // 2b. Subscription gate — Review has no free tier. Admins bypass.
  if (!isAdmin(user.email)) {
    const access = await checkSubscription(supabase, user.id);
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: "Subscription required" },
        { status: 403 }
      );
    }
  }

  // 3. Rate limit per user. Two buckets: minute-window blocks burst abuse,
  //    day-window blocks slow cost-bleed against the paid Anthropic API.
  const rlMin = rateLimit(`review:min:${user.id}`, { limit: 10, windowMs: 60_000 });
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
  const rlDay = rateLimit(`review:day:${user.id}`, {
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

  // 4b. Resolve person_id: verify ownership if provided, auto-create if new name.
  let effectivePersonId: string | null = input.personId ?? null;
  if (effectivePersonId) {
    const owns = await verifyPersonOwnership(supabase, user.id, effectivePersonId);
    if (!owns) {
      return NextResponse.json({ error: "Invalid person" }, { status: 400 });
    }
    // Touch updated_at so the person sorts to the top in the picker
    await supabase
      .from("persons")
      .update({ updated_at: new Date().toISOString() })
      .eq("person_id", effectivePersonId)
      .eq("user_id", user.id);
  } else if (input.personName) {
    // Auto-create with "other" relationship since Review doesn't collect it.
    // Dedup: reuse existing person with same name before creating.
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
        person_id: effectivePersonId,
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
        person_id: effectivePersonId,
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
  let saveWarning = false;
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
      // Client still shows the aiOutput in memory, but the DB row is
      // is_complete=false with null reflection. Flag it so the client knows
      // the save is partial and the insights pipeline can re-derive later.
      saveWarning = true;
    }
  }

  // 9. Extract pattern observation (fire-and-forget).
  // Review AI already produces a taxonomy-constrained pattern_tag.
  // Write it to pattern_observations so the Insights tab can aggregate.
  if (aiOutput?.pattern_tag) {
    try {
      const tag = aiOutput.pattern_tag as ObservationTag;
      const tagDesc = OBSERVATION_TAG_DESCRIPTIONS[tag];
      if (tagDesc) {
        // Idempotency: skip if observation already exists for this raw record
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
            source_interaction_entry_id: reviewEntryId,
            person_id: effectivePersonId,
            thread_id: input.threadId ?? null,
            observation_type: OBSERVATION_TYPE_FOR_TAG[tag],
            observation_tag: tag,
            direction: tagDesc.direction,
            confidence_score: 0.8, // Fixed for v0.5; future extractors may vary by source quality
            observation_source: "observed",
            extractor_version: "review_v1",
            supporting_evidence_json: {
              how_user_likely_came_across:
                aiOutput.how_user_likely_came_across,
              where_projecting: aiOutput.where_projecting,
            },
          });
        }
      }
    } catch {
      // Non-critical: observation extraction failure should not fail the review.
      // The tag is still stored in ai_reflection_json for backfill.
      console.error("review: pattern observation insert failed");
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
