-- Track when the user's one free Review session was consumed.
-- Mirrors free_prepare_used_at on the same table.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS free_review_used_at timestamptz;
