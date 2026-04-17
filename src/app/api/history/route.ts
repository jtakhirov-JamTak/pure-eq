import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const DELETABLE_TYPES = [
  "prepare",
  "review",
  "repair",
  "trigger_log",
  "overwhelmed",
] as const;

const MODULE_LABEL: Record<(typeof DELETABLE_TYPES)[number], string> = {
  prepare: "Prepare",
  review: "Review",
  repair: "Repair",
  trigger_log: "Triggered",
  overwhelmed: "Overwhelmed",
};

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).max(10_000),
  limit: z.coerce.number().int().min(1).max(50),
});

export async function GET(req: Request) {
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

  const rl = await rateLimit(`history-get:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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
