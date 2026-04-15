-- Pure EQ v0 — Layer 1 (raw_records) + Layer 2 (canonical objects)
-- RLS: every table scoped by auth.uid() = user_id

create extension if not exists "pgcrypto";

-- ============================================================
-- user_profiles — Layer 2: Communication Profile snapshot
-- ============================================================
create table if not exists public.user_profiles (
  profile_snapshot_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  primary_profile text not null,
  secondary_profile text,
  scoring_version integer not null default 1,
  routing_output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_profiles_user_id_idx
  on public.user_profiles (user_id, created_at desc);

alter table public.user_profiles enable row level security;

create policy "user_profiles_select_own" on public.user_profiles
  for select using (auth.uid() = user_id);
create policy "user_profiles_insert_own" on public.user_profiles
  for insert with check (auth.uid() = user_id);
create policy "user_profiles_update_own" on public.user_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_profiles_delete_own" on public.user_profiles
  for delete using (auth.uid() = user_id);

-- ============================================================
-- persons — Layer 2: people the user has conversations with
-- ============================================================
create table if not exists public.persons (
  person_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  relationship_domain text not null
    check (relationship_domain in
      ('partner','friend','family','manager','direct_report','coworker','client','other')),
  relationship_subtype text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists persons_user_id_idx
  on public.persons (user_id, is_active);

alter table public.persons enable row level security;

create policy "persons_select_own" on public.persons
  for select using (auth.uid() = user_id);
create policy "persons_insert_own" on public.persons
  for insert with check (auth.uid() = user_id);
create policy "persons_update_own" on public.persons
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "persons_delete_own" on public.persons
  for delete using (auth.uid() = user_id);

-- ============================================================
-- conversation_threads — Layer 2: durable threads across entries
-- ============================================================
create table if not exists public.conversation_threads (
  thread_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.persons(person_id) on delete set null,
  title text,
  thread_type text,
  status text not null default 'open'
    check (status in ('open','stabilizing','resolved','abandoned')),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists conversation_threads_user_idx
  on public.conversation_threads (user_id, status, last_activity_at desc);
create index if not exists conversation_threads_person_idx
  on public.conversation_threads (person_id);

alter table public.conversation_threads enable row level security;

create policy "conversation_threads_select_own" on public.conversation_threads
  for select using (auth.uid() = user_id);
create policy "conversation_threads_insert_own" on public.conversation_threads
  for insert with check (auth.uid() = user_id);
create policy "conversation_threads_update_own" on public.conversation_threads
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversation_threads_delete_own" on public.conversation_threads
  for delete using (auth.uid() = user_id);

-- ============================================================
-- raw_records — Layer 1: source-of-truth log of every entry
-- ============================================================
create table if not exists public.raw_records (
  raw_record_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null
    check (record_type in
      ('onboarding_profile','prepare','review','repair','trigger_log',
       'overwhelmed','outcome_tracking','person_context_edit')),
  module_type text not null,
  source_session_id text not null,
  person_id uuid references public.persons(person_id) on delete set null,
  thread_id uuid references public.conversation_threads(thread_id) on delete set null,
  payload_json jsonb not null,
  schema_version integer not null default 1,
  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists raw_records_user_type_idx
  on public.raw_records (user_id, record_type, created_at desc)
  where deleted_at is null;
create index if not exists raw_records_user_complete_idx
  on public.raw_records (user_id, is_complete, completed_at desc)
  where deleted_at is null;
create index if not exists raw_records_person_idx
  on public.raw_records (person_id) where deleted_at is null;
create index if not exists raw_records_thread_idx
  on public.raw_records (thread_id) where deleted_at is null;

alter table public.raw_records enable row level security;

create policy "raw_records_select_own" on public.raw_records
  for select using (auth.uid() = user_id);
create policy "raw_records_insert_own" on public.raw_records
  for insert with check (auth.uid() = user_id);
create policy "raw_records_update_own" on public.raw_records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "raw_records_delete_own" on public.raw_records
  for delete using (auth.uid() = user_id);
