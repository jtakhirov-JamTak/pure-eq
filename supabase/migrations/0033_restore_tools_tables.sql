-- Migration 0033: restore Tools tables (Overwhelmed + Triggered).
--
-- Reverses 0032 (which dropped these tables 2026-04-25 when Tools was
-- removed from the product). Founder reinstated Tools 2026-04-25 — this
-- migration recreates the tables with their final pre-drop schema:
-- the union of 0002_module_entries.sql + 0007_tools_columns.sql + 0008_tools_hardening.sql.
--
-- record_type enum values 'trigger_log' and 'overwhelmed' were left in
-- place by 0032, so no enum work is needed here.

-- ============================================================
-- overwhelmed_entries
-- ============================================================
create table if not exists public.overwhelmed_entries (
  overwhelmed_entry_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_record_id uuid references public.raw_records(raw_record_id) on delete cascade,

  what_happened text,
  body_sensations text,
  overwhelm_before smallint check (overwhelm_before between 1 and 5),
  overwhelm_after  smallint check (overwhelm_after  between 1 and 5),
  technique_used text,
  after_feeling text,
  ai_response_json jsonb,

  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,

  constraint overwhelmed_entries_after_feeling_check
    check (after_feeling in ('Calmer','Lighter','Hopeful','Relieved','Energized','Same'))
);

create index if not exists overwhelmed_entries_user_idx
  on public.overwhelmed_entries (user_id, created_at desc) where deleted_at is null;

create unique index if not exists overwhelmed_entries_raw_record_uniq
  on public.overwhelmed_entries (raw_record_id)
  where deleted_at is null;

alter table public.overwhelmed_entries enable row level security;

create policy "overwhelmed_entries_select_own" on public.overwhelmed_entries
  for select using (auth.uid() = user_id);
create policy "overwhelmed_entries_insert_own" on public.overwhelmed_entries
  for insert with check (auth.uid() = user_id);
create policy "overwhelmed_entries_update_own" on public.overwhelmed_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "overwhelmed_entries_delete_own" on public.overwhelmed_entries
  for delete using (auth.uid() = user_id);

-- ============================================================
-- trigger_entries
-- ============================================================
create table if not exists public.trigger_entries (
  trigger_entry_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_record_id uuid references public.raw_records(raw_record_id) on delete cascade,
  person_id uuid references public.persons(person_id) on delete set null,
  thread_id uuid references public.conversation_threads(thread_id) on delete set null,

  event_text text,
  interpretation text,
  emotion text,
  emotion_intensity smallint check (emotion_intensity between 1 and 10),
  urge text,
  urge_intensity smallint check (urge_intensity between 1 and 10),
  behavior text,
  outcome text,
  learning text,
  after_feeling text,
  ai_response_json jsonb,

  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,

  constraint trigger_entries_after_feeling_check
    check (after_feeling in ('Calmer','Lighter','Hopeful','Relieved','Energized','Same'))
);

create index if not exists trigger_entries_user_idx
  on public.trigger_entries (user_id, created_at desc) where deleted_at is null;
create index if not exists trigger_entries_person_idx
  on public.trigger_entries (person_id) where deleted_at is null;

create unique index if not exists trigger_entries_raw_record_uniq
  on public.trigger_entries (raw_record_id)
  where deleted_at is null;

alter table public.trigger_entries enable row level security;

create policy "trigger_entries_select_own" on public.trigger_entries
  for select using (auth.uid() = user_id);
create policy "trigger_entries_insert_own" on public.trigger_entries
  for insert with check (auth.uid() = user_id);
create policy "trigger_entries_update_own" on public.trigger_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trigger_entries_delete_own" on public.trigger_entries
  for delete using (auth.uid() = user_id);
