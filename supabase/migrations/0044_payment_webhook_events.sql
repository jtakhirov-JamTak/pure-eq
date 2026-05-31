-- Migration 0044: payment webhook idempotency ledger.
--
-- Slice B2 (coins payments). Stripe delivers each webhook AT LEAST once and
-- retries on any non-2xx or timeout, so the same `checkout.session.completed`
-- event can arrive multiple times. grant_coins is already idempotent on
-- (user_id, ref_key = event_id), but this table is the primary, side-effect-
-- agnostic dedup gate: the webhook INSERTs the event id FIRST and only grants
-- coins if the insert was new. It also doubles as a minimal audit log of every
-- payment event the app has accepted.
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
