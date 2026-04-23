// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { immediateOutcomeSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = immediateOutcomeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = await rateLimit(`review-outcome:min:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Verify the review entry belongs to this user
  // Per-day rate limit
  const rlDay = await rateLimit(`review-outcome:day:${user.id}`, {
    limit: 100,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rlDay.allowed) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  }

  const { data: entry, error: lookupErr } = await supabase
    .from("review_entries")
    .select("review_entry_id, raw_record_id, outcome_json")
    .eq("review_entry_id", input.reviewEntryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupErr || !entry || !entry.raw_record_id) {
    return NextResponse.json({ error: "Review entry not found" }, { status: 404 });
  }

  // Prevent overwriting an existing outcome
  if (entry.outcome_json) {
    return NextResponse.json({ error: "Outcome already submitted" }, { status: 409 });
  }

  // Store outcome
  const outcomeData = {
    movedForward: input.movedForward,
    theySeemUnderstood: input.theySeemUnderstood,
    usedPreparePlan: input.usedPreparePlan,
    submittedAt: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .from("review_entries")
    .update({ outcome_json: outcomeData })
    .eq("review_entry_id", input.reviewEntryId)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("review outcome: update failed", updateErr.code);
    return NextResponse.json({ error: "Could not save outcome" }, { status: 500 });
  }

  // Also store in raw_records for source-of-truth (idempotent via source_session_id)
  const sessionId = `outcome-${input.reviewEntryId}`;
  const { data: existingRaw } = await supabase
    .from("raw_records")
    .select("raw_record_id")
    .eq("user_id", user.id)
    .eq("source_session_id", sessionId)
    .maybeSingle();

  if (!existingRaw) {
    const { error: rawErr } = await supabase
      .from("raw_records")
      .insert({
        user_id: user.id,
        record_type: "outcome_tracking",
        module_type: "outcome_tracking",
        source_session_id: sessionId,
        payload_json: {
          source_entry_type: "review",
          source_entry_id: input.reviewEntryId,
          ...outcomeData,
        },
        schema_version: 1,
        is_complete: true,
        completed_at: new Date().toISOString(),
      });
    if (rawErr) {
      console.error("review outcome: raw_records insert failed", rawErr.code);
    }
  }

  return NextResponse.json({ success: true });
}
