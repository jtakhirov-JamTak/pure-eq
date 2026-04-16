-- Pure EQ domain — replace in fork.
-- Add role column to user_subscriptions for admin access control.
-- Default 'user'; admins set via direct DB update or service role client.

alter table public.user_subscriptions
  add column if not exists role text not null default 'user'
    check (role in ('user', 'admin'));
