-- Migration 0029: free_before_you_send_used_at on user_subscriptions.
--
-- Before You Send gets the same free_one tier as Prepare and Review:
-- 1 free use per signup, then paywall. New column tracks the timestamp
-- of the user's first BYS submission.
--
-- Pin against user-initiated writes via WITH CHECK clause on the existing
-- update policy (mirrors migration 0017's pattern for free_prepare_used_at
-- and free_review_used_at). Without this, a user could PATCH the column
-- back to NULL via the Supabase REST API and reset their own paywall.
-- All writes must go through reserveFreeUse() in src/lib/subscription.ts
-- (which uses the service role client).

alter table public.user_subscriptions
  add column if not exists free_before_you_send_used_at timestamptz;

-- Re-pin the update policy to include the new column. Drop + re-create
-- the existing policy from 0017 with the additional WITH CHECK clause.
drop policy if exists "user_subscriptions_update_own" on public.user_subscriptions;

create policy "user_subscriptions_update_own" on public.user_subscriptions
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and status = (select us.status from public.user_subscriptions us where us.user_id = auth.uid())
    and role = (select us.role from public.user_subscriptions us where us.user_id = auth.uid())
    and free_prepare_used_at is not distinct from (select us.free_prepare_used_at from public.user_subscriptions us where us.user_id = auth.uid())
    and free_review_used_at is not distinct from (select us.free_review_used_at from public.user_subscriptions us where us.user_id = auth.uid())
    and free_before_you_send_used_at is not distinct from (select us.free_before_you_send_used_at from public.user_subscriptions us where us.user_id = auth.uid())
  );
