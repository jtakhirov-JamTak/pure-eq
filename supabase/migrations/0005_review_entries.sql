-- Pure EQ domain — replace in fork.
-- Pure EQ v0 — review_entries table (Coach: Review flow)
-- Mirrors prepare_entries shape. Links back to raw_records (Layer 1) as
-- source of truth. RLS scoped by auth.uid() = user_id.

create table if not exists public.review_entries (
  review_entry_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_record_id uuid references public.raw_records(raw_record_id) on delete cascade,
  person_id uuid references public.persons(person_id) on delete set null,
  thread_id uuid references public.conversation_threads(thread_id) on delete set null,

  what_happened text,
  hardest_moment_feeling text,
  observed_in_them text,
  their_experience text,
  what_helped text,
  what_hurt text,
  validated_assumptions text,
  unresolved_and_next text,

  ai_reflection_json jsonb,
  ai_reflection_version integer,

  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists review_entries_user_idx
  on public.review_entries (user_id, created_at desc) where deleted_at is null;
create index if not exists review_entries_person_idx
  on public.review_entries (person_id) where deleted_at is null;
create index if not exists review_entries_thread_idx
  on public.review_entries (thread_id) where deleted_at is null;

alter table public.review_entries enable row level security;

create policy "review_entries_select_own" on public.review_entries
  for select using (auth.uid() = user_id);
create policy "review_entries_insert_own" on public.review_entries
  for insert with check (auth.uid() = user_id);
create policy "review_entries_update_own" on public.review_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "review_entries_delete_own" on public.review_entries
  for delete using (auth.uid() = user_id);
