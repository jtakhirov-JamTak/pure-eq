-- Admin dashboard perf: the /admin/users page used to fetch up to 5000
-- raw_records rows and count them in JS to derive per-user entry counts and
-- last-active timestamps. Past the 5000-row cap (across ALL users) the counts
-- silently truncated — users beyond the cap showed 0 entries / no last-active.
--
-- This view pushes the aggregation into Postgres: one row per user, no cap.
--
-- Semantics preserved from the old JS path: ALL raw_records are counted,
-- including soft-deleted (deleted_at IS NOT NULL) rows. The 30-day purge
-- (migration 0047) hard-deletes those within a month, so the drift is bounded.
--
-- security_invoker = on: the view is in the `public` schema and therefore
-- reachable via PostgREST. With invoker security, RLS on raw_records applies to
-- whoever queries — a normal authenticated user can only ever aggregate their
-- OWN rows (no cross-user leak). The admin page queries with the service-role
-- client, which bypasses RLS and so sees every user's totals.

create or replace view public.admin_user_activity
with (security_invoker = on) as
select
  user_id,
  count(*)::bigint        as entry_count,
  max(created_at)         as last_active
from public.raw_records
group by user_id;

-- Belt-and-suspenders: this is an admin-only aggregate; no client role needs it.
revoke all on public.admin_user_activity from anon, authenticated;
grant select on public.admin_user_activity to service_role;

notify pgrst, 'reload schema';
