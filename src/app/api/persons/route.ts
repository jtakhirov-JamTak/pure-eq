// Pure EQ domain — replace in fork.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPersonSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";

export const runtime = "nodejs";

// GET /api/persons — list active persons, optional ?q= name search
export async function GET(req: Request) {
  // 1. Auth.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limit.
  const rl = rateLimit(`persons:get:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 3. Optional search query.
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();

  let query = supabase
    .from("persons")
    .select(
      "person_id, display_name, relationship_domain, relationship_subtype, created_at"
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (q && q.length > 0) {
    // Escape LIKE metacharacters so user input can't wildcard-match everything
    const escaped = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.ilike("display_name", `%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("persons list error:", error.message);
    return NextResponse.json(
      { error: "Failed to load persons" },
      { status: 500 }
    );
  }

  return NextResponse.json({ persons: data });
}

// POST /api/persons — create a new person
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

  const parsed = createPersonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  // 2. Auth.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Rate limit — minute + day buckets.
  const rlMin = rateLimit(`persons:post:min:${user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rlMin.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const rlDay = rateLimit(`persons:post:day:${user.id}`, {
    limit: 50,
    windowMs: 86_400_000,
  });
  if (!rlDay.allowed) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  }

  // 4. Insert.
  const { data, error } = await supabase
    .from("persons")
    .insert({
      user_id: user.id,
      display_name: input.displayName,
      relationship_domain: input.relationshipDomain,
      relationship_subtype: input.relationshipSubtype ?? null,
    })
    .select("person_id, display_name, relationship_domain, relationship_subtype")
    .single();

  if (error) {
    console.error("person create error:", error.message);
    return NextResponse.json(
      { error: "Failed to create person" },
      { status: 500 }
    );
  }

  return NextResponse.json({ person: data }, { status: 201 });
}
