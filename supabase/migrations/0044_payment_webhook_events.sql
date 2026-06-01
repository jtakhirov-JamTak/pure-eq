-- Migration 0044: payment webhook idempotency ledger.
--
-- Slice B2 (coins payments). Stripe delivers each webhook AT LEAST once and
-- retries on any non-2xx or timeout, so the same `checkout.session.completed`
-- event can arrive multiple times. grant_coins is itself idempotent on
-- (user_id, ref_key = event_id), so the credit can never double-apply. This
-- table is a fast-path "already processed" marker plus a minimal audit log of
-- every payment event the app has accepted.
--
-- ORDERING (see src/app/api/payments/webhook/route.ts): the webhook GRANTS
-- COINS FIRST and INSERTs the event id only AFTER the grant succeeds. Recording
-- after — not before — means a transient grant failure returns 500, Stripe
-- retries, and the retry actually re-attempts the credit instead of being
-- swallowed by a pre-written event row (which would strand a paid purchase).
-- Do NOT "optimize" this into insert-first; the grant is the real guarantee.
--
-- Greenfield + additive: no existing table touched. System table — there is no
-- user_id and no client ever reads it; the webhook writes via the service-role
-- client (which bypasses RLS). RLS is enabled with NO policies so that anon /
-- authenticated clients can never select it.

create table if not exists public.payment_webhook_events (
  -- Stripe event id (evt_...). PRIMARY KEY = the idempotency guarantee: a
  -- replayed event hits a unique-violation and is treated as already-processed.
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.payment_webhook_events enable row level security;
-- No policies on purpose: service-role only. Not user-readable.

-- PostgREST holds a stale schema cache up to ~10 min after DDL; force a reload
-- so the new table is visible immediately.
notify pgrst, 'reload schema';
