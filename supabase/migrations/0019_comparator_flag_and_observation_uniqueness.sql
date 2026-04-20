-- Migration 0019: user feature flags + observation uniqueness + comparator insight_type
--
-- Part 1: user_feature_flags table. Separate from user_subscriptions because
-- subscriptions are billing state and flags are access state. Future flags
-- add columns here, not more tables. SELECT policy is user-scoped; writes
-- are service-role only until an admin UI exists (intentional for v0).
--
-- Part 2: unique index on pattern_observations(user_id, source_raw_record_id,
-- observation_tag). Prompt 2 moves extractors to multi-tag writes and the
-- backfill endpoint to multi-source. Idempotency moves from app-layer
-- SELECT-then-INSERT to a DB-enforced INSERT ... ON CONFLICT DO NOTHING, which
-- is the only approach safe against concurrent submits / retries / backfill
-- re-runs without races.
--
-- Part 3: relax derived_insights insight_type CHECK to include
-- 'reflection_regulation_gap' — the comparator row written by the writer
-- when a user's reflection score materially exceeds their regulation score.

-- Part 1
create table if not exists public.user_feature_flags (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_comparator boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_feature_flags enable row level security;

create policy "user_feature_flags_select_own" on public.user_feature_flags
  for select using (auth.uid() = user_id);
-- No INSERT / UPDATE / DELETE policies — service role only. Flags are flipped
-- via direct DB update until an admin UI exists.

-- Part 2
-- Pre-flight dedup. The unique index will hard-fail on the first duplicate
-- triple, aborting the whole migration. Pre-Prompt-2 extractors used SELECT-
-- before-INSERT so dupes shouldn't exist, but a hand-edited row, partial
-- migration replay, or future operator running migrations blindly would
-- otherwise hit a wall with no automatic remediation. Keep the lowest
-- pattern_observation_id per triple; delete the rest. Idempotent on a
-- dupe-free DB (the CTE selects zero rows to delete).
with ranked as (
  select
    pattern_observation_id,
    row_number() over (
      partition by user_id, source_raw_record_id, observation_tag
      order by pattern_observation_id
    ) as rn
  from public.pattern_observations
)
delete from public.pattern_observations
where pattern_observation_id in (
  select pattern_observation_id from ranked where rn > 1
);

create unique index if not exists
  pattern_observations_user_source_tag_unique_idx
  on public.pattern_observations (user_id, source_raw_record_id, observation_tag);

-- Part 3
alter table public.derived_insights
  drop constraint if exists derived_insights_insight_type_check;

alter table public.derived_insights
  add constraint derived_insights_insight_type_check
  check (insight_type in ('top_pattern', 'person_pattern', 'reflection_regulation_gap'));
