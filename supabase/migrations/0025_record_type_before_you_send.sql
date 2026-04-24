-- Migration 0025: add 'before_you_send' to raw_records.record_type CHECK.
--
-- Coach redesign introduces Before You Send as a 4th Coach module. Every
-- BYS submission writes one raw_records row (record_type = 'before_you_send').
--
-- KEEP 'repair' in the allowed set even though /coach/repair is being
-- deleted. Legacy raw_records rows with record_type='repair' must continue
-- to read for /history. Dropping the value would orphan archived rows
-- (RLS read still works on existing data, but a future re-INSERT would
-- be rejected — and we want the door closed cleanly, not partially).
--
-- The original CHECK was created inline in 0001_init_core.sql, so its
-- constraint name is the auto-generated raw_records_record_type_check.
-- Drop + re-add is the clean way to widen an inline CHECK.

alter table public.raw_records
  drop constraint if exists raw_records_record_type_check;

alter table public.raw_records
  add constraint raw_records_record_type_check
  check (record_type in (
    'onboarding_profile',
    'prepare',
    'review',
    'repair',
    'trigger_log',
    'overwhelmed',
    'outcome_tracking',
    'person_context_edit',
    'before_you_send'
  ));
