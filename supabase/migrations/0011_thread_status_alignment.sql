-- Pure EQ domain — replace in fork.
-- Align conversation_threads.status CHECK with product doc §4.C.
-- Old: open, stabilizing, resolved, abandoned
-- New: open, stabilizing, resolved, paused, worsened, ended
-- No data migration needed — no threads exist yet.

ALTER TABLE public.conversation_threads
  DROP CONSTRAINT conversation_threads_status_check;

ALTER TABLE public.conversation_threads
  ADD CONSTRAINT conversation_threads_status_check
  CHECK (status IN ('open','stabilizing','resolved','paused','worsened','ended'));
