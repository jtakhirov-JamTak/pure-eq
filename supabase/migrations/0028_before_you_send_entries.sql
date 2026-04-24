-- Migration 0028: before_you_send_entries table.
--
-- New Coach surface. User pastes a draft message + selects message_type +
-- (optionally) names intent; Claude returns a verdict (safe | risky |
-- do_not_send) plus 4 fields (how_this_will_land, what_its_missing,
-- thing_to_cut [verbatim quote of the user's words], check_in_question).
-- User can edit and re-submit ("Check it again") indefinitely.
--
-- Mirrors prepare_entries / review_entries / repair_entries shape:
--   - PK + FK to raw_records on delete cascade
--   - person_id / thread_id columns kept for symmetry but always NULL
--     (BYS is stateless w.r.t. people/threads — see runCoachModule
--     personBehavior:"skip" + threadBehavior:"none" config)
--   - jsonb ai_verdict_json + integer ai_verdict_version
--   - is_complete + soft-delete via deleted_at
--   - outcome_json reserved for future "did you send the rewritten draft"
--     follow-up (no endpoint yet)
--
-- Each "Check it again" re-submit gets a FRESH idempotencyKey from the
-- client → distinct raw_records row + distinct before_you_send_entries
-- row. /history will list each iteration as its own entry.

create table if not exists public.before_you_send_entries (
  before_you_send_entry_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_record_id uuid references public.raw_records(raw_record_id) on delete cascade,
  person_id uuid references public.persons(person_id) on delete set null,
  thread_id uuid references public.conversation_threads(thread_id) on delete set null,

  draft_text text,
  message_type text
    check (message_type in (
      'conflict', 'check_in', 'apology', 'repair', 'ask', 'boundary', 'other'
    )),
  intent_optional text,

  ai_verdict_json jsonb,
  ai_verdict_version integer,

  outcome_json jsonb,

  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists before_you_send_entries_user_idx
  on public.before_you_send_entries (user_id, created_at desc) where deleted_at is null;
create index if not exists before_you_send_entries_person_idx
  on public.before_you_send_entries (person_id) where deleted_at is null;
create index if not exists before_you_send_entries_thread_idx
  on public.before_you_send_entries (thread_id) where deleted_at is null;

-- Pre-flight dedup CTE before the unique index, mirroring migration 0006.
-- Idempotent on a clean DB; defends against retroactive replay.
with ranked as (
  select
    before_you_send_entry_id,
    row_number() over (
      partition by raw_record_id
      order by created_at asc
    ) as rn
  from public.before_you_send_entries
  where deleted_at is null and raw_record_id is not null
)
delete from public.before_you_send_entries
where before_you_send_entry_id in (select before_you_send_entry_id from ranked where rn > 1);

create unique index if not exists before_you_send_entries_raw_record_uniq
  on public.before_you_send_entries (raw_record_id)
  where deleted_at is null;

alter table public.before_you_send_entries enable row level security;

create policy "before_you_send_entries_select_own" on public.before_you_send_entries
  for select using (auth.uid() = user_id);
create policy "before_you_send_entries_insert_own" on public.before_you_send_entries
  for insert with check (auth.uid() = user_id);
create policy "before_you_send_entries_update_own" on public.before_you_send_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "before_you_send_entries_delete_own" on public.before_you_send_entries
  for delete using (auth.uid() = user_id);
