-- Hardening for repair_entries: add NOT NULL on text fields (Zod already
-- requires them but DB should enforce too) and index on raw_record_id
-- (queried by the idempotency check in the route).
-- Idempotent: safe to re-run.

-- raw_record_id index for the derived-row lookup
create index if not exists repair_entries_raw_record_idx
  on public.repair_entries (raw_record_id);

-- NOT NULL on text fields that Zod requires
alter table public.repair_entries
  alter column what_needs_repair set not null;
alter table public.repair_entries
  alter column your_responsibility set not null;
alter table public.repair_entries
  alter column their_need set not null;
