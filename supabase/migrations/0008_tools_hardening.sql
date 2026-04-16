-- Pure EQ domain — replace in fork.
-- Hardening for Tools tab: unique indexes on derived entries + CHECK on after_feeling.
-- Mirrors 0006_unique_idempotency.sql pattern (raw_records already covered there).

-- Unique index: one overwhelmed_entry per raw_record (prevents TOCTOU duplicates).
create unique index if not exists overwhelmed_entries_raw_record_uniq
  on public.overwhelmed_entries (raw_record_id)
  where deleted_at is null;

-- Unique index: one trigger_entry per raw_record.
create unique index if not exists trigger_entries_raw_record_uniq
  on public.trigger_entries (raw_record_id)
  where deleted_at is null;

-- CHECK constraint: after_feeling on overwhelmed_entries.
alter table public.overwhelmed_entries
  add constraint overwhelmed_entries_after_feeling_check
    check (after_feeling in ('Calmer','Lighter','Hopeful','Relieved','Energized','Same'));

-- CHECK constraint: after_feeling on trigger_entries.
alter table public.trigger_entries
  add constraint trigger_entries_after_feeling_check
    check (after_feeling in ('Calmer','Lighter','Hopeful','Relieved','Energized','Same'));
