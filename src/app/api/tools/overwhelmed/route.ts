// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createOverwhelmedSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { resolveToolsPerson } from "@/lib/tools/resolve-person";

export const runtime = "nodejs";

const requestSchema = createOverwhelmedSchema.extend({
  idempotencyKey: z.string().uuid(),
});

// Cooldown-latched Sentry for cleanup-delete failures. A failed cleanup
// leaves an orphan raw_records row with no derived row — quietly inflates
// admin "Tools" counts and fakes the user out of idempotent retries.
const CLEANUP_CAPTURE_COOLDOWN_MS = 5 * 60 * 1000;
let lastCleanupCaptureAt = 0;

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

  // 2b. Coins redesign Phase 3: Tools are free (login-only); no access gate.
  // 3. Rate limit — minute bucket blocks burst, day bucket blocks row exhaustion.
  const rlMin = await rateLimit(`overwhelmed:min:${user.id}`, {
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
      }
    );
  }
  const rlDay = await rateLimit(`overwhelmed:day:${user.id}`, {
    limit: 100,
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

  // 3b. Optional "who was this about?" link — verify a picked id, or
  // dedup/create a typed name (relationship "other"). Never trust client ids.
  const person = await resolveToolsPerson(
    supabase,
    user.id,
    input.personId,
    input.personName,
  );
  if (!person.ok) {
    return NextResponse.json({ error: "Invalid person" }, { status: 400 });
  }

  // 4. Idempotency check — reuse existing raw row on retry.
  const { data: existingRaw, error: existingErr } = await supabase
    .from("raw_records")
    .select("raw_record_id")
    .eq("user_id", user.id)
    .eq("source_session_id", idempotencyKey)
    .maybeSingle();
  if (existingErr) {
    console.error("overwhelmed: idempotency check failed", existingErr.code);
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
        record_type: "overwhelmed",
        module_type: "tools",
        source_session_id: idempotencyKey,
        person_id: person.personId,
        payload_json: {
          fields: {
            beforeRating: input.beforeRating,
            bodyLocation: input.bodyLocation ?? null,
            feelingLabel: input.feelingLabel,
            afterRating: input.afterRating,
            afterFeeling: input.afterFeeling,
            personId: input.personId ?? null,
            personName: input.personName ?? null,
          },
        },
        schema_version: 1,
        is_complete: true,
        completed_at: new Date().toISOString(),
      })
      .select("raw_record_id")
      .single();

    if (rawErr || !rawInserted) {
      console.error("overwhelmed: raw_records insert failed", rawErr?.code);
      return NextResponse.json(
        { error: "Could not save entry" },
        { status: 500 }
      );
    }
    rawRecordId = rawInserted.raw_record_id;
  }

  // 5. Derived row — overwhelmed_entries.
  const { data: existingDerived, error: derivedLookupErr } = await supabase
    .from("overwhelmed_entries")
    .select("overwhelmed_entry_id")
    .eq("user_id", user.id)
    .eq("raw_record_id", rawRecordId)
    .maybeSingle();
  if (derivedLookupErr) {
    console.error("overwhelmed: derived lookup failed", derivedLookupErr.code);
    return NextResponse.json(
      { error: "Could not save entry" },
      { status: 500 }
    );
  }

  if (!existingDerived) {
    const { error: derivedErr } = await supabase
      .from("overwhelmed_entries")
      .insert({
        user_id: user.id,
        raw_record_id: rawRecordId,
        person_id: person.personId,
        what_happened: input.feelingLabel,
        body_sensations: input.bodyLocation ?? null,
        overwhelm_before: input.beforeRating,
        overwhelm_after: input.afterRating,
        after_feeling: input.afterFeeling,
        technique_used: "box_breathing",
        is_complete: true,
        completed_at: new Date().toISOString(),
      });

    if (derivedErr) {
      console.error("overwhelmed: derived insert failed", derivedErr.code);
      // Cleanup raw row only if we inserted it this request.
      if (!existingRaw) {
        const { error: cleanupErr } = await supabase
          .from("raw_records")
          .delete()
          .eq("user_id", user.id)
          .eq("raw_record_id", rawRecordId);
        if (cleanupErr) {
          const now = Date.now();
          if (now - lastCleanupCaptureAt > CLEANUP_CAPTURE_COOLDOWN_MS) {
            lastCleanupCaptureAt = now;
            Sentry.captureException(
              new Error("overwhelmed_cleanup_failed"),
              { tags: { area: "tools", kind: "cleanup_orphan_raw" } },
            );
          }
          console.error(
            "overwhelmed: cleanup delete failed",
            cleanupErr.code,
          );
        }
      }
      return NextResponse.json(
        { error: "Could not save entry" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    rawRecordId,
  });
}
