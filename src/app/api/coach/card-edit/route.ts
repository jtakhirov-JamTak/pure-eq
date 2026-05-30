import { z } from "zod";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { checkOrigin } from "@/lib/check-origin";
import { rateLimit } from "@/lib/rate-limit";
import { AI_CARD_ENTRY_TABLES } from "@/types";

export const runtime = "nodejs";

// ============================================================
// Card edit — Accept / Edit / Not-true on a single AI card
// ============================================================
// Coins redesign Slice A: AI cards become interactive. This endpoint upserts
// the user's verdict into ai_card_edits (one row per
// user+entry_table+entry_id+card_key — migration 0039's unique index is the
// upsert target). When the user edits a card, edited_text becomes the version
// of record; calibration / memory read it instead of the model's original.
//
// Polymorphic: entry_table names one of five Coach derived tables. We verify
// ownership of the referenced entry before writing any edit (the entry row's
// PK column differs per table — see ENTRY_ID_COLUMN).

const ENTRY_ID_COLUMN: Record<string, string> = {
  prepare_entries: "prepare_entry_id",
  review_entries: "review_entry_id",
  before_you_send_entries: "before_you_send_entry_id",
  pulse_check_entries: "pulse_check_entry_id",
  repair_entries: "repair_entry_id",
};

const schema = z
  .object({
    entryTable: z.enum(AI_CARD_ENTRY_TABLES),
    entryId: z.string().uuid(),
    cardKey: z.string().trim().min(1).max(64),
    status: z.enum(["accepted", "edited", "not_true"]),
    editedText: z.string().trim().min(1).max(2000).nullable().optional(),
    originalText: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  // edited status REQUIRES replacement text; the other two must not carry it.
  .refine(
    (d) =>
      d.status !== "edited" ||
      (typeof d.editedText === "string" && d.editedText.length > 0),
    { message: "editedText is required when status is edited" },
  );

export async function POST(req: Request) {
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  // 3. Auth.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 4. Rate limit — two buckets. 30/min for rapid Accept/Edit/Not-true
  // tapping across a result screen's cards; 500/day to cap a compromised
  // session per CLAUDE.md "Per-day rate limit ... extended to writes". The
  // upsert is idempotent on the unique card key, so the day cap bounds
  // abuse rather than legitimate row growth.
  const rlMin = await rateLimit(`card-edit:min:${user.id}`, {
    limit: 30,
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
  const rlDay = await rateLimit(`card-edit:day:${user.id}`, {
    limit: 500,
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

  const idColumn = ENTRY_ID_COLUMN[input.entryTable];

  // 5. Verify the referenced entry belongs to this user before writing any
  // edit. Without this, a valid-shaped request could attach an edit row to
  // another user's entry id (the edit row is RLS-scoped, but the entry_id it
  // points at must still be the caller's).
  const ownerLookup = await (
    supabase.from(input.entryTable) as ReturnType<typeof supabase.from>
  )
    .select(idColumn)
    .eq(idColumn, input.entryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (ownerLookup.error) {
    console.error("card-edit: ownership lookup failed", ownerLookup.error.code);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
  if (!ownerLookup.data) {
    return NextResponse.json({ error: "Invalid entry" }, { status: 400 });
  }

  // 6. Upsert the card edit (idempotent on the unique card key).
  const { error: upsertErr } = await supabase.from("ai_card_edits").upsert(
    {
      user_id: user.id,
      entry_table: input.entryTable,
      entry_id: input.entryId,
      card_key: input.cardKey,
      status: input.status,
      edited_text: input.status === "edited" ? (input.editedText ?? null) : null,
      original_text: input.originalText ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,entry_table,entry_id,card_key" },
  );
  if (upsertErr) {
    console.error("card-edit: upsert failed", upsertErr.code);
    Sentry.captureException(upsertErr, {
      tags: { area: "coach", kind: "card_edit_upsert_failed" },
    });
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  // 7. Sync predicted_reaction when the Prepare Predicted Reaction card is
  // edited or rejected, so Review calibration reads the user's corrected
  // forecast (edited) or no forecast (not_true) instead of the model's wrong
  // prediction. "accepted" leaves the column as the model wrote it. The edit
  // row is already saved; this column sync is best-effort — log + capture but
  // do not 500 (a failed sync must not make the user re-judge the card).
  if (
    input.entryTable === "prepare_entries" &&
    input.cardKey === "predicted_reaction"
  ) {
    let synced: string | null | undefined;
    if (input.status === "edited") synced = input.editedText ?? null;
    else if (input.status === "not_true") synced = null;
    if (synced !== undefined) {
      const { error: syncErr } = await supabase
        .from("prepare_entries")
        .update({ predicted_reaction: synced })
        .eq("prepare_entry_id", input.entryId)
        .eq("user_id", user.id);
      if (syncErr) {
        console.error(
          "card-edit: predicted_reaction sync failed",
          syncErr.code,
        );
        Sentry.captureException(syncErr, {
          tags: { area: "coach", kind: "predicted_reaction_sync_failed" },
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
