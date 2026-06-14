import { NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { checkOrigin } from "@/lib/check-origin";
import { rateLimit } from "@/lib/rate-limit";
import { isAdmin } from "@/lib/admin";
import { isAIDisabled } from "@/lib/kill-switch";
import {
  costForTier,
  getBalance,
  spendCoins,
  refundCoins,
  nextGenerationAttempt,
} from "@/lib/coins";
import { runBilledGeneration } from "@/lib/coach/billed-generation";
import { runCoachAiCall, persistCoachAiOutput } from "@/lib/coach/generation";
import { buildPreparePrompt } from "@/lib/ai/prompts";
import { prepareOutputSchema } from "@/lib/ai/schemas";
import { prepareModuleConfig } from "@/app/api/coach/prepare/route";
import type { AiTier, ProfileType } from "@/types";

type PrepareAiOutput = z.infer<typeof prepareOutputSchema>;

export const runtime = "nodejs";

// ============================================================
// Regenerate — pay again to re-run AI feedback on an EXISTING entry
// ============================================================
// Unlike the create route (run-module), regenerate targets a saved entry by id
// and rebuilds the prompt from the STORED inputs (the client viewing a past
// entry doesn't have the original form data). It charges a FRESH full-tier
// generation under its own spend-key namespace — `regen:<entryId>:<nonce>:gen:N`
// — so it never collides with the original `<idempotencyKey>:gen:N` ladder. The
// per-press nonce makes a double-tap idempotent (same key → already_applied, no
// double charge) while a new press charges again, mirroring how the original
// idempotencyKey works. Refund-on-failure is inherited from runBilledGeneration.
//
// Phase 1: Prepare only. Other coach modules can opt in by adding their prompt
// rebuild + module config to the dispatch below.

const schema = z.object({
  module: z.literal("prepare"),
  entryId: z.string().uuid(),
  // Fresh UUID per Regenerate press — the billing idempotency token.
  regenerateNonce: z.string().uuid(),
});

const PROFILE_VALUES: ProfileType[] = [
  "direct",
  "reflective",
  "warm",
  "measured",
  "perceptive",
  "intense",
];

export async function POST(req: Request) {
  // 1. Origin check (mutating + spends coins).
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Rate limit — two buckets (coins are the real cost gate; these cap abuse).
  const rlMin = await rateLimit(`regenerate:min:${user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rlMin.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rlMin.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }
  const rlDay = await rateLimit(`regenerate:day:${user.id}`, {
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
      },
    );
  }

  // 4. Validate.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { entryId, regenerateNonce } = parsed.data;

  // 5. Load the entry (ownership via user_id filter). All Prepare inputs live in
  // columns; personName + relationship come from the raw payload (as submitted).
  const { data: entry, error: entryErr } = await supabase
    .from("prepare_entries")
    .select(
      "prepare_entry_id, raw_record_id, ai_tier, situation_text, conversation_type_primary, conversation_type_secondary, feeling_and_why, my_pattern, fairest_version, their_feeling_want, hidden_ask_and_floor, opener, trigger_plan",
    )
    .eq("prepare_entry_id", entryId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (entryErr) {
    console.error("regenerate: entry load failed", entryErr.code);
    return NextResponse.json({ error: "Could not load entry" }, { status: 500 });
  }
  if (!entry || !entry.raw_record_id) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const tier: AiTier = entry.ai_tier === "deep" ? "deep" : "quick";
  const coinCost = costForTier(tier);

  // 6. Person name + relationship from the raw payload, and the user's profile.
  const [rawRes, profileRes] = await Promise.all([
    supabase
      .from("raw_records")
      .select("payload_json")
      .eq("raw_record_id", entry.raw_record_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("primary_profile")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (profileRes.error || !profileRes.data) {
    return NextResponse.json(
      { error: "Could not load profile" },
      { status: 500 },
    );
  }
  const rawProfile = profileRes.data.primary_profile;
  if (!(PROFILE_VALUES as string[]).includes(rawProfile)) {
    return NextResponse.json({ error: "Profile invalid" }, { status: 500 });
  }
  const profile = rawProfile as ProfileType;

  const payload = (rawRes.data?.payload_json ?? {}) as Record<string, unknown>;
  const personName =
    typeof payload.personName === "string" && payload.personName.trim()
      ? payload.personName
      : "this person";
  const relationship =
    typeof payload.relationship === "string" && payload.relationship.trim()
      ? payload.relationship
      : "other";

  // 7. Kill switch — entry is untouched; refuse the paid regeneration without
  // charging (mirror run-module's disabled path).
  if (isAIDisabled()) {
    return NextResponse.json({
      aiOutput: null,
      coinsSpent: 0,
      aiFailureKind: "disabled",
      message:
        "Coaching feedback is paused for maintenance right now. Your saved feedback is unchanged — please try again later.",
    });
  }

  // 8. Rebuild the prompt from stored inputs.
  const prompt = buildPreparePrompt({
    profile,
    tier,
    personName,
    relationship,
    conversationTypePrimary: entry.conversation_type_primary ?? "understand",
    conversationTypeSecondary: entry.conversation_type_secondary ?? null,
    situation: entry.situation_text ?? "",
    feelingAndWhy: entry.feeling_and_why ?? "",
    myPattern: entry.my_pattern ?? "",
    fairestVersion: entry.fairest_version ?? "",
    theirFeelingWant: entry.their_feeling_want ?? "",
    hiddenAskAndFloor: entry.hidden_ask_and_floor ?? "",
    opener: entry.opener ?? "",
    triggerPlan: entry.trigger_plan ?? "",
  });

  // 9. Reserve → generate → persist → reconcile. Fresh charge under the
  // regenerate spend-key namespace. Admins bypass the debit.
  const adminUser = isAdmin(user.email);
  const billed = await runBilledGeneration<PrepareAiOutput>({
    userId: user.id,
    module: "prepare",
    adminUser,
    idempotencyKey: `regen:${entryId}:${regenerateNonce}`,
    tier,
    coinCost,
    coins: { nextGenerationAttempt, spendCoins, refundCoins, getBalance },
    generate: () =>
      runCoachAiCall<PrepareAiOutput>(
        "prepare",
        prompt,
        prepareModuleConfig.aiOutputSchema,
      ),
    persist: (aiOutput) =>
      persistCoachAiOutput(
        supabase,
        prepareModuleConfig,
        user.id,
        entryId,
        aiOutput,
      ),
  });

  // 10. Map billing outcome → HTTP.
  if (billed.kind === "insufficient") {
    return NextResponse.json(
      { error: "Insufficient coins", needed: coinCost, balance: billed.balance },
      { status: 402 },
    );
  }
  if (billed.kind === "spend_error") {
    return NextResponse.json({ error: "Could not charge" }, { status: 500 });
  }

  // AI failed (output not regenerated) — the OLD cards are still saved, nothing
  // changed. No charge (refunded inside runBilledGeneration). Surface a retry.
  if (!billed.aiOutput || billed.saveWarning) {
    return NextResponse.json({
      aiOutput: null,
      coinsSpent: 0,
      aiFailureKind: billed.failureKind,
      message:
        "Couldn't regenerate feedback this time. Your saved feedback is unchanged — try again in a moment.",
    });
  }

  // 11. Success — the entry now holds the new cards. Clear stale per-card edits
  // (Accept/Edit/Not-true) keyed to the OLD cards; best-effort (the regen
  // already succeeded, so a wipe failure must not fail the response).
  const { error: wipeErr } = await supabase
    .from("ai_card_edits")
    .delete()
    .eq("user_id", user.id)
    .eq("entry_table", "prepare_entries")
    .eq("entry_id", entryId);
  if (wipeErr) {
    console.error("regenerate: card-edit wipe failed", wipeErr.code);
    Sentry.captureException(wipeErr, {
      tags: { area: "coach", kind: "regen_edit_wipe_failed" },
    });
  }

  return NextResponse.json({
    success: true,
    regenerated: true,
    aiOutput: billed.aiOutput,
    coinsSpent: billed.coinsSpent,
  });
}
