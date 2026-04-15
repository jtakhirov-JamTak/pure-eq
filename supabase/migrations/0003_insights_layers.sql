-- Pure EQ domain — replace in fork.
-- Pure EQ v0 — Layer 2D (relationship_memories), Layer 3 (pattern_observations),
-- Layer 4 (derived_insights). Tag taxonomy is CLOSED v1 — enforced via CHECK.
-- RLS: every table scoped by auth.uid() = user_id.

-- ============================================================
-- relationship_memories — Layer 2D: per-person durable memory
-- ============================================================
create table if not exists public.relationship_memories (
  relationship_memory_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references public.persons(person_id) on delete cascade,
  user_written_context text,
  pinned_notes text,
  last_interaction_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, person_id)
);

create index if not exists relationship_memories_user_idx
  on public.relationship_memories (user_id);

alter table public.relationship_memories enable row level security;

create policy "relationship_memories_select_own" on public.relationship_memories
  for select using (auth.uid() = user_id);
create policy "relationship_memories_insert_own" on public.relationship_memories
  for insert with check (auth.uid() = user_id);
create policy "relationship_memories_update_own" on public.relationship_memories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "relationship_memories_delete_own" on public.relationship_memories
  for delete using (auth.uid() = user_id);

-- ============================================================
-- pattern_observations — Layer 3: structured signals from entries
-- Closed v1 taxonomy (Sections 7.5, 7.6) enforced via CHECK.
-- ============================================================
create table if not exists public.pattern_observations (
  pattern_observation_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.persons(person_id) on delete set null,
  thread_id uuid references public.conversation_threads(thread_id) on delete set null,
  source_raw_record_id uuid not null
    references public.raw_records(raw_record_id) on delete cascade,
  source_interaction_entry_id uuid,

  observation_type text not null
    check (observation_type in (
      'communication_move',
      'stress_response',
      'trigger_pattern',
      'repair_behavior',
      'outcome_linked_behavior'
    )),

  observation_tag text not null
    check (observation_tag in (
      'defended_intent_early',
      'assumed_meaning_without_checking',
      'delayed_direct_ask',
      'withdrew_under_tension',
      'over_explained_when_misunderstood',
      'moved_to_solution_too_fast',
      'validation_present',
      'repair_attempt_helped',
      'repair_attempt_missed_ownership',
      'escalated_after_trigger',
      'recurring_trigger_criticism',
      'recurring_trigger_pressure',
      'prepare_plan_not_used'
    )),

  direction text check (direction in ('positive','negative','neutral')),
  confidence_score numeric(3,2) not null
    check (confidence_score >= 0 and confidence_score <= 1),
  observed_at timestamptz not null default now(),
  extractor_version text not null,
  supporting_evidence_json jsonb
);

create index if not exists pattern_observations_user_tag_idx
  on public.pattern_observations (user_id, observation_tag, observed_at desc);
create index if not exists pattern_observations_person_idx
  on public.pattern_observations (person_id, observed_at desc);
create index if not exists pattern_observations_thread_idx
  on public.pattern_observations (thread_id);
create index if not exists pattern_observations_source_idx
  on public.pattern_observations (source_raw_record_id);

alter table public.pattern_observations enable row level security;

create policy "pattern_observations_select_own" on public.pattern_observations
  for select using (auth.uid() = user_id);
create policy "pattern_observations_insert_own" on public.pattern_observations
  for insert with check (auth.uid() = user_id);
create policy "pattern_observations_update_own" on public.pattern_observations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pattern_observations_delete_own" on public.pattern_observations
  for delete using (auth.uid() = user_id);

-- ============================================================
-- derived_insights — Layer 4: computed summaries for display
-- Thresholds (Section 11) enforced in application code, not here —
-- this table only stores already-qualified insights.
-- ============================================================
create table if not exists public.derived_insights (
  derived_insight_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  insight_type text not null
    check (insight_type in (
      'recurring_blind_spot',
      'how_you_tend_to_land',
      'person_specific',
      'profile_display'
    )),
  person_id uuid references public.persons(person_id) on delete set null,

  time_window_type text not null
    check (time_window_type in ('thirty_day','ninety_day','lifetime')),
  period_start timestamptz not null,
  period_end timestamptz not null,

  summary_text text not null,
  confidence_level text not null
    check (confidence_level in (
      'not_enough_evidence',
      'emerging_pattern',
      'established_pattern'
    )),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  distinct_days integer not null default 0 check (distinct_days >= 0),
  event_types_used jsonb not null default '[]'::jsonb,
  supporting_pattern_ids jsonb not null default '[]'::jsonb,

  generator_version text not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,

  check (period_end > period_start)
);

create index if not exists derived_insights_user_type_idx
  on public.derived_insights (user_id, insight_type, generated_at desc);
create index if not exists derived_insights_person_idx
  on public.derived_insights (person_id);
create index if not exists derived_insights_active_idx
  on public.derived_insights (user_id, expires_at);

alter table public.derived_insights enable row level security;

create policy "derived_insights_select_own" on public.derived_insights
  for select using (auth.uid() = user_id);
create policy "derived_insights_insert_own" on public.derived_insights
  for insert with check (auth.uid() = user_id);
create policy "derived_insights_update_own" on public.derived_insights
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "derived_insights_delete_own" on public.derived_insights
  for delete using (auth.uid() = user_id);
