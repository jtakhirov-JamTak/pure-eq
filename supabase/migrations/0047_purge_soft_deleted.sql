-- Retention policy (founder decision 2026-06-09): items a user individually
-- deletes are SOFT-deleted (deleted_at set) and must be HARD-deleted 30 days
-- later. Account deletion remains a separate, immediate hard cascade — this job
-- only sweeps individually-deleted rows.
--
-- Mechanism: a SECURITY DEFINER purge function + a daily pg_cron job. Pure DB,
-- no app endpoint to secure, runs even if the app is down. The function bypasses
-- RLS by design (owner-run) so it purges across all users.
--
-- Scope: every table carrying a deleted_at soft-delete flag (the four threaded
-- Coach modules + Before-You-Send + the two Tools modules + raw_records).
-- raw_records is purged LAST; entries and their raw record are soft-deleted with
-- the SAME timestamp, so they age past the cutoff together.

create extension if not exists pg_cron;

create or replace function public.purge_soft_deleted()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - interval '30 days';
  total bigint := 0;
  n bigint;
begin
  -- `deleted_at < cutoff` already excludes NULL (live) rows: NULL < x is unknown.
  delete from public.prepare_entries        where deleted_at < cutoff; get diagnostics n = row_count; total := total + n;
  delete from public.review_entries         where deleted_at < cutoff; get diagnostics n = row_count; total := total + n;
  delete from public.pulse_check_entries    where deleted_at < cutoff; get diagnostics n = row_count; total := total + n;
  delete from public.repair_entries         where deleted_at < cutoff; get diagnostics n = row_count; total := total + n;
  delete from public.before_you_send_entries where deleted_at < cutoff; get diagnostics n = row_count; total := total + n;
  delete from public.overwhelmed_entries    where deleted_at < cutoff; get diagnostics n = row_count; total := total + n;
  delete from public.trigger_entries        where deleted_at < cutoff; get diagnostics n = row_count; total := total + n;
  delete from public.raw_records            where deleted_at < cutoff; get diagnostics n = row_count; total := total + n;
  raise notice 'purge_soft_deleted removed % rows deleted before %', total, cutoff;
  return total;
end;
$$;

-- Daily at 03:17 UTC (off-peak; odd minute avoids the top-of-hour herd).
-- cron.schedule upserts by job name, so re-running this migration is safe.
select cron.schedule(
  'purge-soft-deleted-daily',
  '17 3 * * *',
  $$select public.purge_soft_deleted();$$
);
