import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { requirePaidAccessApi } from "@/lib/require-access";

export const runtime = "nodejs";

// Includes legacy `repair` so archived repair rows still surface in the
// list. See /history/page.tsx for the full rationale.
const DELETABLE_TYPES = [
  "prepare",
  "review",
  "before_you_send",
  "repair",
] as const;

const MODULE_LABEL: Record<(typeof DELETABLE_TYPES)[number], string> = {
  prepare: "Prepare",
  review: "Review",
  before_you_send: "Before Send",
  repair: "Repair",
};

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).max(10_000),
  limit: z.coerce.number().int().min(1).max(50),
});

export async function GET(req: Request) {
  // Enumeration endpoint — same origin-check discipline as mutating routes.
  // SameSite=Lax blocks form-POST CSRF but not fetch-based CSRF from a
  // compromised page; the list endpoint leaks entry ids + dates if reached
  // from a foreign origin with the user's cookie.
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    offset: url.searchParams.get("offset"),
    limit: url.searchParams.get("limit"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { offset, limit } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Paid-only enumeration surface.
  const gate = await requirePaidAccessApi(user);
  if (gate) return gate;

  const rlMin = await rateLimit(`history-get:min:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rlMin.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  // Day bucket — caps scraping by a compromised session.
  const rlDay = await rateLimit(`history-get:day:${user.id}`, {
    limit: 1000,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rlDay.allowed) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  }

  const { data: rows, error } = await supabase
    .from("raw_records")
    .select("raw_record_id, record_type, created_at, completed_at")
    .eq("user_id", user.id)
    .in("record_type", DELETABLE_TYPES as unknown as string[])
    .eq("is_complete", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("history-get: fetch failed", error.code);
    return NextResponse.json({ error: "Could not load" }, { status: 500 });
  }

  const entries = (rows ?? []).map((r) => ({
    id: r.raw_record_id,
    recordType: r.record_type,
    label:
      MODULE_LABEL[r.record_type as keyof typeof MODULE_LABEL] ?? r.record_type,
    completedAt: r.completed_at ?? r.created_at,
  }));

  return NextResponse.json({ entries });
}
