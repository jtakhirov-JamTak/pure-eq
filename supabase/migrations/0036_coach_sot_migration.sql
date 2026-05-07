-- Migration 0036: Coach SOT migration.
--
-- Implements the locked SOT from the 25-persona cross-eval (planning
-- session 2026-05-06). Single transactional migration covering:
--   1. raw_records.record_type CHECK extension (adds 'pulse_check')
--   2. prepare_entries: 10 new SOT fields + body_location CHECK
--   3. pulse_check_entries (NEW TABLE — splits from former Prepare Path B)
--   4. review_entries: 24 new SOT columns + 1 index + 4 CHECKs
--   5. before_you_send_entries: risk_context column
--   6. user_subscriptions: free_pulse_check_used_at + RLS policy refresh
--
-- Additive + nullable everywhere. Existing rows stay readable. Deprecated
-- columns are NOT dropped — historical /history reads still work. Per
-- CLAUDE.md "feature removal needs a second pass for strings" lesson,
-- column drop is a separate post-launch cleanup once we're confident
-- nothing reads the legacy shape.
--
-- Pulse Check table mirrors before_you_send_entries (migration 0028)
-- shape: PK + raw_record_id NOT NULL FK ON DELETE CASCADE, person_id /
-- thread_id ON DELETE SET NULL, ai_*_json + ai_*_version, outcome_json,
-- is_complete + created_at + completed_at + deleted_at, partial unique
-- index on (raw_record_id) WHERE deleted_at IS NULL with pre-flight
-- dedup CTE.

-- ============================================================
-- 1. Extend raw_records.record_type CHECK to include 'pulse_check'.
--    Pattern: migration 0025:16-31 (verbatim).
-- ============================================================
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
    'before_you_send',
    'pulse_check'
  ));

-- ============================================================
-- 2. prepare_entries: 10 new SOT fields + deprecation comments.
-- ============================================================
alter table public.prepare_entries
  add column if not exists emotion_as_data text;
alter table public.prepare_entries
  add column if not exists observed_from_them text;
alter table public.prepare_entries
  add column if not exists their_state_hedged text;
alter table public.prepare_entries
  add column if not exists fairest_version text;
alter table public.prepare_entries
  add column if not exists predicted_reaction text;
alter table public.prepare_entries
  add column if not exists hidden_expectation text;
alter table public.prepare_entries
  add column if not exists specific_shift text;
alter table public.prepare_entries
  add column if not exists outcome_floor text;
alter table public.prepare_entries
  add column if not exists opener text;
alter table public.prepare_entries
  add column if not exists body_location text;

-- body_location CHECK (8 values, NO fuzzy_cant_tell — that's pulse-only).
alter table public.prepare_entries
  drop constraint if exists prepare_entries_body_location_check;
alter table public.prepare_entries
  add constraint prepare_entries_body_location_check
  check (body_location is null or body_location in (
    'throat','chest','stomach','jaw','shoulders','face','other','dont_notice'
  ));

-- Deprecation comments. New Prepare form does not collect these; rows
-- written before 2026-05-06 still hold values; /history continues to read.
comment on column public.prepare_entries.their_need is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Replaced by their_state_hedged + fairest_version. Kept nullable for legacy /history reads.';
comment on column public.prepare_entries.how_to_make_them_feel is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Removed as projection-training trap (cross-eval finding). Kept nullable for legacy /history reads.';
comment on column public.prepare_entries.what_feels_off is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Pulse Check module now owns this concept. Kept nullable for legacy /history reads.';
comment on column public.prepare_entries.what_changed is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Pulse Check module now owns this concept. Kept nullable for legacy /history reads.';
comment on column public.prepare_entries.story_telling_yourself is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Pulse Check module now owns this concept (renamed `story`). Kept nullable for legacy /history reads.';
comment on column public.prepare_entries.afraid_it_means is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Pulse Check module now owns adjacent concept. Kept nullable for legacy /history reads.';
comment on column public.prepare_entries.signal_noise_observation is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Pulse Check module now owns this column with the same name. Kept nullable for legacy /history reads.';
comment on column public.prepare_entries.path is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Path A/B discriminator removed; Pulse Check is its own module. Kept nullable for legacy /history reads.';

-- ============================================================
-- 3. pulse_check_entries (NEW TABLE).
--    Mirrors before_you_send_entries shape (migration 0028:23-46).
-- ============================================================
create table if not exists public.pulse_check_entries (
  pulse_check_entry_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_record_id uuid not null references public.raw_records(raw_record_id) on delete cascade,
  person_id uuid references public.persons(person_id) on delete set null,
  thread_id uuid references public.conversation_threads(thread_id) on delete set null,

  what_feels_off text,
  what_changed_and_before text,
  when_it_shifted text,
  feeling_text text,
  body_location text
    check (body_location is null or body_location in (
      'throat','chest','stomach','jaw','shoulders','face','other','dont_notice','fuzzy_cant_tell'
    )),
  theirs_not_about_you text,
  story text,
  alternative text,
  signal_noise_observation text,
  next_move_chip text
    check (next_move_chip is null or next_move_chip in (
      'wait_observe','regulate_first','ask_clarifying','prepare_conversation','use_bys','review','do_nothing'
    )),
  light_check_question text,

  ai_output_json jsonb,
  ai_output_version integer,

  outcome_json jsonb,

  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists pulse_check_entries_user_idx
  on public.pulse_check_entries (user_id, created_at desc) where deleted_at is null;
create index if not exists pulse_check_entries_person_idx
  on public.pulse_check_entries (person_id) where deleted_at is null;
create index if not exists pulse_check_entries_thread_idx
  on public.pulse_check_entries (thread_id) where deleted_at is null;

-- Pre-flight dedup CTE before unique index, mirroring 0028:55-68.
-- Idempotent on a clean DB; defends against retroactive replay.
with ranked as (
  select
    pulse_check_entry_id,
    row_number() over (
      partition by raw_record_id
      order by created_at asc
    ) as rn
  from public.pulse_check_entries
  where deleted_at is null and raw_record_id is not null
)
delete from public.pulse_check_entries
where pulse_check_entry_id in (select pulse_check_entry_id from ranked where rn > 1);

create unique index if not exists pulse_check_entries_raw_record_uniq
  on public.pulse_check_entries (raw_record_id)
  where deleted_at is null;

alter table public.pulse_check_entries enable row level security;

create policy "pulse_check_entries_select_own" on public.pulse_check_entries
  for select using (auth.uid() = user_id);
create policy "pulse_check_entries_insert_own" on public.pulse_check_entries
  for insert with check (auth.uid() = user_id);
create policy "pulse_check_entries_update_own" on public.pulse_check_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pulse_check_entries_delete_own" on public.pulse_check_entries
  for delete using (auth.uid() = user_id);

-- ============================================================
-- 4. review_entries: 24 new SOT columns + index + CHECKs.
-- ============================================================
-- Identity / linkage.
alter table public.review_entries
  add column if not exists review_depth text;
alter table public.review_entries
  add column if not exists linked_prepare_entry_id uuid
    references public.prepare_entries(prepare_entry_id) on delete set null;

-- New base fields (Quick + Full Review).
alter table public.review_entries
  add column if not exists body_location text;
alter table public.review_entries
  add column if not exists feeling_tracking text;
alter table public.review_entries
  add column if not exists easier_or_harder text;
alter table public.review_entries
  add column if not exists treat_as_data text;
alter table public.review_entries
  add column if not exists something_that_helped text;
alter table public.review_entries
  add column if not exists signs_how_they_left text;
alter table public.review_entries
  add column if not exists turning_point text;
alter table public.review_entries
  add column if not exists what_protecting text;
alter table public.review_entries
  add column if not exists what_protecting_text text;
alter table public.review_entries
  add column if not exists lesson_about_them text;
alter table public.review_entries
  add column if not exists lesson_about_self text;
alter table public.review_entries
  add column if not exists lesson_differently text;
alter table public.review_entries
  add column if not exists forecast text;

-- Standalone branch (Page 5 of Full Review when no linked Prepare).
alter table public.review_entries
  add column if not exists what_else_explains text;
alter table public.review_entries
  add column if not exists what_read_missed text;

-- Calibration block (Page 5 of Full Review when linked Prepare exists).
-- Stored as jsonb for the 3-chip composite (signal/assumption/outcome).
alter table public.review_entries
  add column if not exists calibration_block jsonb;

-- Repair branch field swap (replaces your_part / secret_want /
-- could_make_them_feel — those columns retained for historical reads).
alter table public.review_entries
  add column if not exists impact_to_name text;
alter table public.review_entries
  add column if not exists their_need_first text;
alter table public.review_entries
  add column if not exists pressure_vs_care text;
alter table public.review_entries
  add column if not exists timing_when text;
alter table public.review_entries
  add column if not exists timing_now boolean;
alter table public.review_entries
  add column if not exists first_repair_sentence text;

-- CHECK constraints on enum-typed text columns.
alter table public.review_entries
  drop constraint if exists review_entries_review_depth_check;
alter table public.review_entries
  add constraint review_entries_review_depth_check
  check (review_depth is null or review_depth in ('quick','full'));

alter table public.review_entries
  drop constraint if exists review_entries_body_location_check;
alter table public.review_entries
  add constraint review_entries_body_location_check
  check (body_location is null or body_location in (
    'throat','chest','stomach','jaw','shoulders','face','other','dont_notice'
  ));

alter table public.review_entries
  drop constraint if exists review_entries_what_protecting_check;
alter table public.review_entries
  add constraint review_entries_what_protecting_check
  check (what_protecting is null or what_protecting in (
    'status','safety','image','relationship','time',
    'boundaries','being_right','not_feeling_stupid','other'
  ));

alter table public.review_entries
  drop constraint if exists review_entries_their_need_first_check;
alter table public.review_entries
  add constraint review_entries_their_need_first_check
  check (their_need_first is null or their_need_first in (
    'acknowledgment','clarity','safety','space','boundary'
  ));

-- Index for calibration lookups: which Reviews link back to a given Prepare.
create index if not exists review_entries_linked_prepare_idx
  on public.review_entries (linked_prepare_entry_id)
  where deleted_at is null and linked_prepare_entry_id is not null;

-- Deprecation + reframing comments.
comment on column public.review_entries.hardest_moment_feeling is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Replaced by feeling_tracking + body_location. Kept nullable for legacy /history reads.';
comment on column public.review_entries.observed_in_them is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Two-column observed_raw/interpreted_raw split (migration 0034) covers this. Kept nullable for legacy /history reads.';
comment on column public.review_entries.their_experience is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Replaced by lesson_about_them. Kept nullable for legacy /history reads.';
comment on column public.review_entries.what_you_avoided is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Removed (low cross-eval value). Kept nullable for legacy /history reads.';
comment on column public.review_entries.ask_before_understanding is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Removed (low cross-eval value). Kept nullable for legacy /history reads.';
comment on column public.review_entries.your_part is
  'DEPRECATED 2026-05-06 (Coach SOT cross-eval). Replaced by repair-swap fields (impact_to_name + pressure_vs_care + first_repair_sentence). Kept nullable for legacy /history reads.';
comment on column public.review_entries.secret_want is
  'DEPRECATED 2026-04-25 (review-repair full-review fixes). Removed as projection-training trap. Kept nullable for legacy /history reads.';
comment on column public.review_entries.could_make_them_feel is
  'DEPRECATED 2026-04-25 (review-repair full-review fixes). Removed as projection-training trap. Kept nullable for legacy /history reads.';
comment on column public.review_entries.needs_to_happen_next is
  'REFRAMED 2026-05-06 (Coach SOT cross-eval). Now driven by select_needs_with_forecast composite step (chip + forecast text). Column persists; semantics evolved.';

-- ============================================================
-- 5. before_you_send_entries: optional risk context.
-- ============================================================
alter table public.before_you_send_entries
  add column if not exists risk_context text;

-- ============================================================
-- 6. user_subscriptions: free Pulse Check tracking + RLS pin refresh.
--    Pattern: migration 0029:14-30.
-- ============================================================
alter table public.user_subscriptions
  add column if not exists free_pulse_check_used_at timestamptz;

-- Re-pin the update policy to include the new column. Without this, a
-- malicious client could PATCH the column back to null via the Supabase
-- REST API and re-burn their free Pulse Check use.
drop policy if exists "user_subscriptions_update_own" on public.user_subscriptions;

create policy "user_subscriptions_update_own" on public.user_subscriptions
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and status = (select us.status from public.user_subscriptions us where us.user_id = auth.uid())
    and role = (select us.role from public.user_subscriptions us where us.user_id = auth.uid())
    and free_prepare_used_at is not distinct from (select us.free_prepare_used_at from public.user_subscriptions us where us.user_id = auth.uid())
    and free_review_used_at is not distinct from (select us.free_review_used_at from public.user_subscriptions us where us.user_id = auth.uid())
    and free_before_you_send_used_at is not distinct from (select us.free_before_you_send_used_at from public.user_subscriptions us where us.user_id = auth.uid())
    and free_pulse_check_used_at is not distinct from (select us.free_pulse_check_used_at from public.user_subscriptions us where us.user_id = auth.uid())
  );
