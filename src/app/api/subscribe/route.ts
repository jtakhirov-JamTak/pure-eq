// Pure EQ domain — replace in fork.
// v0 mock: activates subscription directly. When Stripe ships,
// this endpoint becomes the checkout-session creator and the row is
// written by the webhook handler instead.
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { createSubscription } from "@/lib/subscription";
import { subscribeSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!checkOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 0. Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Auth.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Rate limit — tight to prevent abuse of the mock subscribe.
  const rlMin = await rateLimit(`subscribe:min:${user.id}`, {
    limit: 3,
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
  const rlDay = await rateLimit(`subscribe:day:${user.id}`, {
    limit: 10,
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

  // Create subscription (mock — no Stripe).
  const result = await createSubscription(user.id, parsed.data.plan);
  if (!result.success) {
    Sentry.captureException(new Error("subscribe_activation_failed"), {
      tags: { area: "subscribe", kind: "activate" },
    });
    return NextResponse.json(
      { error: "Could not activate subscription" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
