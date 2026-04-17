import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = await rateLimit(`threads:get:${user.id}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(req.url);
  const personId = url.searchParams.get("personId");
  const includeAll = url.searchParams.get("all") === "true";

  let query = supabase
    .from("conversation_threads")
    .select("thread_id, title, status, person_id, last_activity_at, started_at")
    .eq("user_id", user.id)
    .order("last_activity_at", { ascending: false })
    .limit(50);

  if (personId) {
    query = query.eq("person_id", personId);
  }

  if (!includeAll) {
    query = query.in("status", ["open", "stabilizing"]);
  }

  const { data, error } = await query;
  if (error) {
    console.error("threads GET: query failed", error.code);
    return NextResponse.json({ error: "Could not load threads" }, { status: 500 });
  }

  return NextResponse.json({ threads: data ?? [] });
}
