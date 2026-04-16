-- Pure EQ domain — replace in fork.
-- User subscription state for paywall gating.
-- v0: subscribe action is mocked (no Stripe). Stripe columns are nullable
-- and will be populated when real payment integration ships.

create table if not exists public.user_subscriptions (
  subscription_id        uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  status                 text not null default 'none'
    check (status in ('none','trial_active','active','trial_expired','cancelled')),
  free_prepare_used_at   timestamptz,
  trial_started_at       timestamptz,
  trial_ends_at          timestamptz,
  activated_at           timestamptz,
  cancelled_at           timestamptz,
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint user_subscriptions_user_unique unique (user_id)
);

alter table public.user_subscriptions enable row level security;

create policy "user_subscriptions_select_own" on public.user_subscriptions
  for select using (auth.uid() = user_id);
-- INSERT: users can only create rows with status='none' and role='user'.
-- This prevents a user from inserting status='active' or role='admin'.
create policy "user_subscriptions_insert_own" on public.user_subscriptions
  for insert with check (auth.uid() = user_id and status = 'none' and role = 'user');
-- UPDATE: users can update own row but cannot change status or role.
-- The WITH CHECK ensures status and role stay at their current values.
-- Only the service role client (admin actions, server routes) can change these.
create policy "user_subscriptions_update_own" on public.user_subscriptions
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and status = (select us.status from public.user_subscriptions us where us.user_id = auth.uid())
    and role = (select us.role from public.user_subscriptions us where us.user_id = auth.uid())
  );
-- No DELETE policy — users must not delete their own subscription row.
-- Deletion would reset free-Prepare tracking and allow infinite trials.
