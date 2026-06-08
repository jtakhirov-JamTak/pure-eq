// Pure EQ domain — coins purchase checkout (Slice B2).
//
// Creates a Stripe one-time Checkout Session for a coin pack and returns its
// redirect URL. This route does NOT grant coins — that happens ONLY in the
// webhook after Stripe confirms payment. Here we just start the session.

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/check-origin";
import { checkoutSchema } from "@/lib/validation";
import { getStripe, packForKey, priceIdForPack } from "@/lib/payments";

export const runtime = "nodejs";

/**
 * Build the app's base URL for Stripe success/cancel redirects from the request
 * headers (the app never hardcodes its own origin — see auth callback). Falls
 * back to the Origin header's host when Sec-Fetch leaves only that.
 */
function baseUrl(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = req.headers.get("host");
  if (host) {
    const proto = host.startsWith("localhost") || host.startsWith("127.")
      ? "http"
      : "https";
    return `${proto}://${host}`;
  }
  return null;
}

export async function POST(req: Request) {
  // 1. Origin check (CSRF).
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
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 3. Auth.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 4. Rate limit — checkout creation is cheap but a tight cap blocks abuse.
  const rlMin = await rateLimit(`checkout:min:${user.id}`, { limit: 5, windowMs: 60_000 });
  if (!rlMin.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rlMin.resetAt - Date.now()) / 1000)) } },
    );
  }
  const rlDay = await rateLimit(`checkout:day:${user.id}`, { limit: 50, windowMs: 24 * 60 * 60 * 1000 });
  if (!rlDay.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rlDay.resetAt - Date.now()) / 1000)) } },
    );
  }

  // 5. Resolve pack → Stripe price. Misconfigured env (missing price id) or an
  // unconfigured Stripe key is a server fault, not a client error.
  const pack = packForKey(parsed.data.pack);
  if (!pack) {
    return NextResponse.json({ error: "Unknown pack" }, { status: 400 });
  }
  const stripe = getStripe();
  const priceId = priceIdForPack(pack);
  if (!stripe || !priceId) {
    console.error("checkout: Stripe not configured", { hasStripe: !!stripe, hasPrice: !!priceId, pack: pack.key });
    Sentry.captureException(new Error("stripe_not_configured"), {
      tags: { area: "payments", kind: "config_missing" },
    });
    return NextResponse.json({ error: "Payments unavailable" }, { status: 503 });
  }

  const base = baseUrl(req);
  if (!base) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // 6. Create the one-time Checkout Session. metadata.userId + packKey are how
  // the webhook knows who to credit and how many coins (it re-derives the coin
  // amount from packKey via COIN_PACKS — it does NOT trust a coin count here).
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Pin card-only IN CODE. The webhook credits only on a synchronously-paid
      // session and filters out `async_payment_succeeded`, so the card-only
      // assumption MUST hold. Omitting this hands method selection to the Stripe
      // Dashboard — a driftable toggle guarding money. "card" still includes
      // Apple/Google Pay (wallet, synchronous). If async bank methods (iDEAL/
      // SEPA/Bacs) are ever wanted, add them here AND add the
      // async_payment_succeeded webhook handler in the same change.
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      // client_reference_id + metadata both carry the user id (belt and braces);
      // the webhook reads metadata.
      client_reference_id: user.id,
      metadata: { userId: user.id, packKey: pack.key },
      success_url: `${base}/coins?purchase=success`,
      cancel_url: `${base}/coins?purchase=cancelled`,
    });
    if (!session.url) {
      throw new Error("no_session_url");
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout: session create failed");
    // Wrap so Stripe's error.message (which can echo request detail) never
    // reaches Sentry verbatim.
    Sentry.captureException(new Error("checkout_session_create_failed"), {
      tags: { area: "payments", kind: "session_create" },
    });
    void err;
    return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
  }
}
