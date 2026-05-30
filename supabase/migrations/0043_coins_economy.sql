-- Migration 0043: coins economy — wallet + ledger + atomic spend/grant.
--
-- Slice B (coins redesign, plan jiggly-scribbling-ripple.md §11; authoritative
-- economics in memory project_coins_framework_final). Greenfield + additive:
-- touches no existing table, so applying it cannot affect any current flow.
-- Subscription tables (user_subscriptions) stay DORMANT, not dropped, until
-- coins are proven.
--
-- Model (founder-final): coins NEVER expire → balance is a plain integer, not a
-- time-bucketed ledger. coin_transactions is an append-only audit log whose
-- UNIQUE (user_id, ref_key) is the idempotency guarantee for every credit and
-- debit (a replayed request / webhook / strict-mode double-fire is a no-op).
--
-- Charge semantics (founder-final): reserve at start, finalize on success,
-- auto-refund on app failure before output saved. The app debits at generation
-- start (ref_key = idempotencyKey) and, on in-request failure, issues a
-- compensating credit with reason 'refund'. "Disliked output" is post-save →
-- no refund. The functions below are the atomic primitives; the reserve/refund
-- orchestration lives in the app (src/lib/coins.ts + run-module).

-- ============================================================
-- coin_balances — one row per user, the running integer balance.
-- ============================================================
create table if not exists public.coin_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coin_balances enable row level security;

-- Read-own only. NO client insert/update/delete — balance is written
-- exclusively by the SECURITY DEFINER functions below (called via the
-- service-role client). A compromised client cannot top up its own wallet.
create policy "coin_balances_select_own" on public.coin_balances
  for select using (auth.uid() = user_id);

-- ============================================================
-- coin_transactions — append-only ledger (audit + idempotency).
-- ============================================================
create table if not exists public.coin_transactions (
  transaction_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Signed: credits positive (grant/purchase/refund), debits negative.
  delta int not null,
  reason text not null
    check (reason in (
      'signup_grant',
      'purchase',
      'debit_quick',
      'debit_deep',
      'debit_weekly_insights',
      'debit_monthly_report',
      'refund',
      'admin_adjust'
    )),
  -- Idempotency key: a flow idempotencyKey (debits/refunds) or a payment-event
  -- id (purchases). NULL allowed for admin_adjust where no natural key exists.
  ref_key text,
  -- Balance immediately after this txn applied (audit trail; never negative).
  balance_after int not null check (balance_after >= 0),
  created_at timestamptz not null default now()
);

create index if not exists coin_transactions_user_idx
  on public.coin_transactions (user_id, created_at desc);

-- The idempotency guarantee: at most one txn per (user, ref_key). Partial so
-- multiple NULL-ref admin_adjusts don't collide. A duplicate credit/debit
-- attempt hits this and is turned into a no-op by the functions below.
create unique index if not exists coin_transactions_ref_uniq
  on public.coin_transactions (user_id, ref_key)
  where ref_key is not null;

alter table public.coin_transactions enable row level security;

create policy "coin_transactions_select_own" on public.coin_transactions
  for select using (auth.uid() = user_id);

-- ============================================================
-- grant_coins — atomic credit (signup_grant / purchase / refund / admin_adjust).
-- ============================================================
-- Returns 'ok' | 'already_applied' | 'invalid'. Idempotent on (user_id,
-- ref_key): a second call with the same key is a no-op ('already_applied'),
-- so strict-mode double-fire and webhook replays never double-credit.
create or replace function public.grant_coins(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_ref_key text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
  v_new int;
begin
  if p_amount <= 0 then
    return 'invalid';
  end if;

  -- Ensure a row exists, then lock it so the read→insert→update is atomic
  -- per user under concurrency.
  insert into public.coin_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.coin_balances
  where user_id = p_user_id
  for update;

  v_new := v_balance + p_amount;

  -- The unique (user_id, ref_key) index is the real idempotency gate: insert
  -- the ledger row FIRST so a duplicate aborts before the balance changes.
  begin
    insert into public.coin_transactions
      (user_id, delta, reason, ref_key, balance_after)
    values (p_user_id, p_amount, p_reason, p_ref_key, v_new);
  exception when unique_violation then
    return 'already_applied';
  end;

  update public.coin_balances
  set balance = v_new, updated_at = now()
  where user_id = p_user_id;

  return 'ok';
end;
$$;

-- ============================================================
-- spend_coins — atomic debit (debit_quick / debit_deep / debit_*).
-- ============================================================
-- Returns 'ok' | 'insufficient' | 'already_applied' | 'invalid'. Insufficient
-- balance never debits. Idempotent on (user_id, ref_key): retrying the same
-- submission (same idempotencyKey) is a no-op, not a second charge.
create or replace function public.spend_coins(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_ref_key text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
  v_new int;
begin
  if p_amount <= 0 then
    return 'invalid';
  end if;

  insert into public.coin_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.coin_balances
  where user_id = p_user_id
  for update;

  -- Idempotency check up front so a retried key returns 'already_applied'
  -- rather than 'insufficient' when the balance has since been spent down.
  if p_ref_key is not null and exists (
    select 1 from public.coin_transactions
    where user_id = p_user_id and ref_key = p_ref_key
  ) then
    return 'already_applied';
  end if;

  if v_balance < p_amount then
    return 'insufficient';
  end if;

  v_new := v_balance - p_amount;

  begin
    insert into public.coin_transactions
      (user_id, delta, reason, ref_key, balance_after)
    values (p_user_id, -p_amount, p_reason, p_ref_key, v_new);
  exception when unique_violation then
    return 'already_applied';
  end;

  update public.coin_balances
  set balance = v_new, updated_at = now()
  where user_id = p_user_id;

  return 'ok';
end;
$$;

-- ============================================================
-- Lock down the SECURITY DEFINER functions.
-- ============================================================
-- These run as the definer (postgres) and bypass RLS — so they MUST NOT be
-- callable by anon/authenticated clients (a user could otherwise rpc()
-- themselves free coins). Only the service-role client may invoke them.
revoke all on function public.grant_coins(uuid, int, text, text) from public;
revoke all on function public.spend_coins(uuid, int, text, text) from public;
revoke all on function public.grant_coins(uuid, int, text, text) from anon, authenticated;
revoke all on function public.spend_coins(uuid, int, text, text) from anon, authenticated;
grant execute on function public.grant_coins(uuid, int, text, text) to service_role;
grant execute on function public.spend_coins(uuid, int, text, text) to service_role;

-- PostgREST holds a stale schema cache up to ~10 min after DDL; force a reload
-- so the new tables + RPCs are visible immediately.
notify pgrst, 'reload schema';
