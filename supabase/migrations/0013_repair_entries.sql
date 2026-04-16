-- Pure EQ domain — replace in fork.
-- Pure EQ v0 — repair_entries table (Coach: Repair flow)
-- Mirrors review_entries shape. Links back to raw_records (Layer 1) as
-- source of truth. RLS scoped by auth.uid() = user_id.

create table if not exists public.repair_entries (
  repair_entry_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_record_id uuid references public.raw_records(raw_record_id) on delete cascade,
  person_id uuid references public.persons(person_id) on delete set null,
  thread_id uuid references public.conversation_threads(thread_id) on delete set null,

  what_needs_repair text,
  your_responsibility text,
  their_need text,
  desired_outcome text not null
    check (desired_outcome in (
      'acknowledge_impact', 'apologize', 'reset_expectations', 'set_boundary'
    )),
  channel text not null
    check (channel in ('text', 'call', 'in_person', 'no_action')),
  timing text not null
    check (timing in ('now', 'later_today', 'tomorrow', 'after_they_respond')),

  ai_strategy_json jsonb,
  ai_strategy_version integer,

  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists repair_entries_user_idx
  on public.repair_entries (user_id, created_at desc) where deleted_at is null;
create index if not exists repair_entries_person_idx
  on public.repair_entries (person_id) where deleted_at is null;
create index if not exists repair_entries_thread_idx
  on public.repair_entries (thread_id) where deleted_at is null;

alter table public.repair_entries enable row level security;

create policy "repair_entries_select_own" on public.repair_entries
  for select using (auth.uid() = user_id);
create policy "repair_entries_insert_own" on public.repair_entries
  for insert with check (auth.uid() = user_id);
create policy "repair_entries_update_own" on public.repair_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "repair_entries_delete_own" on public.repair_entries
  for delete using (auth.uid() = user_id);
