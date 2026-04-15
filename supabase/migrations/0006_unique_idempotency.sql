-- Pure EQ v0 — Idempotency hardening
-- Closes the TOCTOU race in SELECT-then-INSERT idempotency paths on coach
-- routes. Without these unique indexes, two concurrent retries of the same
-- submission (strict-mode double-mount, slow Supabase, rapid double-tap)
-- can both pass the existence check and both insert, producing duplicate
-- raw_records rows and duplicate derived entries.
--
-- Partial unique WHERE deleted_at IS NULL so soft-deleted rows don't block
-- future legitimate writes with the same key.

create unique index if not exists raw_records_user_session_uniq
  on public.raw_records (user_id, source_session_id)
  where deleted_at is null;

create unique index if not exists prepare_entries_raw_record_uniq
  on public.prepare_entries (raw_record_id)
  where deleted_at is null;

create unique index if not exists review_entries_raw_record_uniq
  on public.review_entries (raw_record_id)
  where deleted_at is null;
