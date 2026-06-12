-- 0050: collapse conversation_threads.status from 6 values to 3.
-- Founder decision 2026-06-12: the six statuses (open, stabilizing, resolved,
-- paused, worsened, ended) confused more than they informed. New model:
--   open        — the conversation hasn't been worked through yet
--   in_progress — it happened / it's evolving (absorbs stabilizing, paused,
--                 worsened)
--   completed   — done (absorbs resolved, ended)
-- resolved_at semantics unchanged: set on completed, null otherwise. Rows
-- mapped resolved/ended -> completed keep their resolved_at; the statuses
-- mapped to in_progress never had one (it was terminal-only).

-- 1. Drop the old CHECK first so the data mapping can run (reused-column
--    CHECK lesson: widen/replace the constraint in the same migration as the
--    new values, never write first and hope).
alter table public.conversation_threads
  drop constraint if exists conversation_threads_status_check;

-- 2. Map existing rows. Idempotent: re-running matches nothing.
update public.conversation_threads
  set status = case status
    when 'stabilizing' then 'in_progress'
    when 'paused' then 'in_progress'
    when 'worsened' then 'in_progress'
    when 'resolved' then 'completed'
    when 'ended' then 'completed'
    else status
  end
  where status in ('stabilizing', 'paused', 'worsened', 'resolved', 'ended');

-- 3. Pre-flight defense before the new CHECK (constraint-migration lesson):
--    any unexpected legacy value becomes 'open' rather than aborting the
--    ALTER. No-op on a healthy DB.
update public.conversation_threads
  set status = 'open'
  where status not in ('open', 'in_progress', 'completed');

-- 4. New CHECK.
alter table public.conversation_threads
  add constraint conversation_threads_status_check
  check (status in ('open', 'in_progress', 'completed'));

notify pgrst, 'reload schema';
