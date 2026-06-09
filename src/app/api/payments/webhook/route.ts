// Pure EQ domain — Stripe payments webhook (Slice B2).
//
// This is the ONLY path that grants purchased coins. It is deliberately
// UNauthenticated and UNgated (no checkOrigin, no auth.getUser, no paywall):
// the Stripe SIGNATURE is the authentication. Adding a user-auth or CSRF gate
// here would reject Stripe's own server-to-server call. (Webhook pattern —
// Engineering Playbook.)
//
// Idempotency is two-layered, both keyed on the Stripe event id. ORDERING
// matters: the credit is the real guarantee and it runs FIRST; the event log is
// written AFTER a successful grant.
//   1. grant_coins(ref_key = event.id) — idempotent credit. A duplicate or
//      racing delivery returns 'already_applied' and never double-credits.
//   2. payment_webhook_events — a fast-path "already processed" marker + audit
//      log, written only after the grant succeeds. Recording AFTER (not before)
//      the grant means a transient grant failure returns 500, Stripe retries,
//      and the retry actually re-attempts the credit instead of being swallowed
//      by a pre-written event row (which would strand a paid purchase).

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, packForKey } from "@/lib/payments";
import { grantCoins } from "@/lib/coins";
import { isWebhookDisabled } from "@/lib/kill-switch";

export const runtime = "nodejs";

// Cooldown-latched capture: if grants start failing (RLS drift, RPC error),
// Stripe retries the same event repeatedly. Without a latch each retry fires a
// capture. Module-scoped per the rate-limit.ts pattern.
const GRANT_FAIL_COOLDOWN_MS = 5 * 60 * 1000;
let lastGrantFailCaptureAt = 0;

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    console.error("webhook: Stripe not configured");
    Sentry.captureException(new Error("stripe_webhook_not_configured"), {
      tags: { area: "payments", kind: "config_missing" },
    });
    // 503 → Stripe will retry later, by which time the env may be set.
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // Raw body is REQUIRED for signature verification — any parsing/transform
  // would change the bytes and break the HMAC. req.text() gives the raw string.
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    // Bad signature = not from Stripe (or a replay with a stale secret). 400 so
    // Stripe marks it failed; do NOT capture (noise from internet scanners).
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ASSUMPTION: card-only checkout, where the session is fully paid the instant
  // it completes — so checkout.session.completed + payment_status==='paid' is
  // the only path that needs to credit. If async/delayed methods (iDEAL, SEPA,
  // Bacs, other bank redirects) are ever enabled in Stripe, a session can
  // complete UNPAID and settle minutes-to-days later; those credit via
  // `checkout.session.async_payment_succeeded`, which is NOT handled here. Add
  // that event type (same grant-first logic below) BEFORE enabling them, or
  // delayed purchases will never credit.
  //
  // Only the one event we subscribed to needs work; ack everything else 200 so
  // Stripe stops retrying unknown types.
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const service = createServiceClient();

  // Fast path: already fully processed (event logged after a prior success).
  // grant_coins would no-op anyway, but this saves the RPC round trip and is the
  // common case for Stripe's at-least-once retries.
  const { data: seen, error: seenErr } = await service
    .from("payment_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (seenErr) {
    // Couldn't check — don't risk acting blind. 500 → Stripe retries.
    console.error("webhook: event-log read failed", seenErr.code);
    Sentry.captureException(new Error("webhook_event_log_read_failed"), {
      tags: { area: "payments", kind: "event_log_read" },
    });
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }
  if (seen) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Only fully-paid sessions grant coins. (mode:'payment' sessions are normally
  // 'paid' on completion, but guard explicitly.)
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, unpaid: true });
  }

  const userId = session.metadata?.userId ?? session.client_reference_id ?? null;
  const packKey = session.metadata?.packKey ?? null;
  const pack = packKey ? packForKey(packKey) : null;

  if (!userId || !pack) {
    // An event we can't act on — without a user id / known pack there's nothing
    // safe to credit. Record it so the retries stop, and surface it.
    console.error("webhook: missing userId or pack in session metadata");
    Sentry.captureException(new Error("webhook_session_missing_metadata"), {
      tags: { area: "payments", kind: "missing_metadata" },
    });
    await service
      .from("payment_webhook_events")
      .insert({ event_id: event.id, type: event.type });
    return NextResponse.json({ received: true, skipped: true });
  }

  // Webhook kill switch (DISABLE_WEBHOOK). At this point the event is authentic,
  // a paid checkout.session.completed, has a known user + pack, and has NOT been
  // processed yet — i.e. a real creditable purchase. Return 503 (NOT 200) so
  // Stripe QUEUES and retries: we have not granted coins and have not logged the
  // event, so clearing the switch lets the retry credit correctly. Placed after
  // all validation/dedup so unknown event types, duplicates, unpaid, and
  // missing-metadata events still ack normally and never enter Stripe's retry
  // loop. NEVER change this to a 200 — that strands the payment permanently.
  if (isWebhookDisabled()) {
    console.error("webhook: paused via DISABLE_WEBHOOK — returning 503 for retry");
    return NextResponse.json({ error: "Webhook paused" }, { status: 503 });
  }

  // Step 1: idempotent credit keyed on the Stripe event id. Coins come from the
  // server's pack table, never from an echoed amount. A racing duplicate gets
  // 'already_applied' here, so no double-credit even before the event is logged.
  const result = await grantCoins(userId, pack.coins, "purchase", event.id);
  if (result === "invalid") {
    const now = Date.now();
    if (now - lastGrantFailCaptureAt >= GRANT_FAIL_COOLDOWN_MS) {
      lastGrantFailCaptureAt = now;
      Sentry.captureException(new Error("webhook_grant_failed"), {
        tags: { area: "payments", kind: "grant_failed" },
      });
    }
    // 500 → Stripe retries. The event is NOT logged below (we return first), so
    // the retry re-attempts the grant rather than short-circuiting — a transient
    // failure self-heals instead of stranding a paid purchase.
    return NextResponse.json({ error: "Grant failed" }, { status: 500 });
  }

  // Step 2: record the event AFTER a successful grant (fast-path marker + audit).
  // A 23505 here means a concurrent delivery already logged it — harmless. Any
  // other error is non-fatal: the grant succeeded, and a later duplicate
  // delivery would just hit grant_coins' 'already_applied' (no double-credit).
  const { error: logErr } = await service
    .from("payment_webhook_events")
    .insert({ event_id: event.id, type: event.type });
  if (logErr && logErr.code !== "23505") {
    console.error("webhook: event-log insert failed (grant already applied)", logErr.code);
  }

  // 'ok' or 'already_applied' → success. Ack so Stripe stops retrying.
  return NextResponse.json({ received: true, granted: result });
}
