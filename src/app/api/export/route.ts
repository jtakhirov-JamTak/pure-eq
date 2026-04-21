import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { requirePaidAccessApi } from "@/lib/require-access";
import { buildExportText } from "@/lib/export";

export const runtime = "nodejs";

// GET /api/export — stream the user's data as a readable .txt file.
// This is the largest "all user content in one request" surface in the app.
// Hardening follows the enumeration-GET lessons from /history:
//   - origin check (CSRF from compromised pages)
//   - auth + user_id filter on every query (handled inside buildExportText)
//   - per-minute + per-day rate limits (prevent burst + slow exfil)
//   - no Cache-Control caching
//   - no server-side logging of content or byte counts
export async function GET(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Paid-only: export is the largest user-content surface in the app.
  const gate = await requirePaidAccessApi(user);
  if (gate) return gate;

  const rlMin = await rateLimit(`export:min:${user.id}`, {
    limit: 3,
    windowMs: 60_000,
  });
  if (!rlMin.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const rlDay = await rateLimit(`export:day:${user.id}`, {
    limit: 10,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rlDay.allowed) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  }

  let text: string;
  try {
    text = await buildExportText(supabase, user.id, user.email ?? "");
  } catch (err) {
    console.error(
      "export: build failed",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json(
      { error: "Could not build export" },
      { status: 500 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="pure-eq-export-${today}.txt"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
