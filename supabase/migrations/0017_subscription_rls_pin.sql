-- Pin free_prepare_used_at and free_review_used_at against user-initiated writes.
-- Users could otherwise send PATCH directly to the Supabase REST API and reset
-- their own free-use timestamps, resetting the paywall.
--
-- After this migration, all mutations to free_*_used_at (and status, role)
-- must go through the service role client — which is what reserveFreeUse()
-- and createSubscription() in src/lib/subscription.ts now use.

drop policy if exists "user_subscriptions_update_own" on public.user_subscriptions;

create policy "user_subscriptions_update_own" on public.user_subscriptions
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and status = (select us.status from public.user_subscriptions us where us.user_id = auth.uid())
    and role = (select us.role from public.user_subscriptions us where us.user_id = auth.uid())
    and free_prepare_used_at is not distinct from (select us.free_prepare_used_at from public.user_subscriptions us where us.user_id = auth.uid())
    and free_review_used_at is not distinct from (select us.free_review_used_at from public.user_subscriptions us where us.user_id = auth.uid())
  );
