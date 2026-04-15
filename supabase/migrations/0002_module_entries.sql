-- Pure EQ domain — replace in fork.
-- Pure EQ v0 — Module entry tables (Prepare / Overwhelmed / Trigger)
-- Each row links back to raw_records (Layer 1) as source of truth.
-- RLS: every table scoped by auth.uid() = user_id.

-- ============================================================
-- prepare_entries — Coach: Prepare flow
-- ============================================================
create table if not exists public.prepare_entries (
  prepare_entry_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_record_id uuid references public.raw_records(raw_record_id) on delete cascade,
  person_id uuid references public.persons(person_id) on delete set null,
  thread_id uuid references public.conversation_threads(thread_id) on delete set null,

  situation_text text,
  desired_outcome text,
  primary_value text,            -- parsed dominant value (e.g. honesty, closeness)
  parsed_candidates jsonb,       -- alternative value candidates
  parse_confidence numeric(3,2),
  ambiguity_flag boolean not null default false,
  needs_user_confirmation boolean not null default false,
  parser_version integer not null default 1,

  ai_plan_json jsonb,            -- structured coach output (opener, moves, watch-outs)
  ai_plan_version integer,

  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists prepare_entries_user_idx
  on public.prepare_entries (user_id, created_at desc) where deleted_at is null;
create index if not exists prepare_entries_person_idx
  on public.prepare_entries (person_id) where deleted_at is null;
create index if not exists prepare_entries_thread_idx
  on public.prepare_entries (thread_id) where deleted_at is null;

alter table public.prepare_entries enable row level security;

create policy "prepare_entries_select_own" on public.prepare_entries
  for select using (auth.uid() = user_id);
create policy "prepare_entries_insert_own" on public.prepare_entries
  for insert with check (auth.uid() = user_id);
create policy "prepare_entries_update_own" on public.prepare_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "prepare_entries_delete_own" on public.prepare_entries
  for delete using (auth.uid() = user_id);

-- ============================================================
-- overwhelmed_entries — Tools: I'm Overwhelmed flow
-- ============================================================
create table if not exists public.overwhelmed_entries (
  overwhelmed_entry_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_record_id uuid references public.raw_records(raw_record_id) on delete cascade,

  what_happened text,
  body_sensations text,
  overwhelm_before smallint check (overwhelm_before between 1 and 5),
  overwhelm_after  smallint check (overwhelm_after  between 1 and 5),
  technique_used text,           -- e.g. box_breathing, grounding_5_4_3_2_1
  ai_response_json jsonb,

  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists overwhelmed_entries_user_idx
  on public.overwhelmed_entries (user_id, created_at desc) where deleted_at is null;

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
-- trigger_entries — Tools: I'm Triggered flow (trigger log)
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
  urge text,
  behavior text,
  outcome text,
  learning text,
  ai_response_json jsonb,

  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists trigger_entries_user_idx
  on public.trigger_entries (user_id, created_at desc) where deleted_at is null;
create index if not exists trigger_entries_person_idx
  on public.trigger_entries (person_id) where deleted_at is null;

alter table public.trigger_entries enable row level security;

create policy "trigger_entries_select_own" on public.trigger_entries
  for select using (auth.uid() = user_id);
create policy "trigger_entries_insert_own" on public.trigger_entries
  for insert with check (auth.uid() = user_id);
create policy "trigger_entries_update_own" on public.trigger_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trigger_entries_delete_own" on public.trigger_entries
  for delete using (auth.uid() = user_id);
