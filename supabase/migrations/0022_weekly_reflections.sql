-- Migration 0022: weekly_reflections
--
-- One row per user per ~7 days. Stores the LLM-generated weekly reflection
-- (or a refusal row on safety trigger / insufficient evidence). Replaces
-- the tag-counter / derived_insights cache retired in Commit A of the
-- insights rebuild. Old tables (pattern_observations, derived_insights)
-- are renamed to _v1_archive in migration 0023.
--
-- DELIBERATE DESIGN NOTE: no string-enum CHECK constraints on this table.
-- Migration 0018 had to relax three CHECKs on derived_insights because the
-- writer's symbols ("top_pattern", "emerging", "all_time") had drifted from
-- the initial constraint strings ("recurring_blind_spot", "emerging_pattern",
-- "thirty_day/ninety_day/lifetime"). Every INSERT silently failed for months,
-- masked by the page's fallthrough-to-live-compute.
--
-- For weekly_reflections, ai_json.mode ("reflection" vs "refusal") is the
-- only enum-ish string and it is validated by reflectionOutputSchema (Zod)
-- before the INSERT runs. We do NOT mirror that enum in a DB CHECK. A failed
-- Zod parse returns 400 before reaching Postgres; a valid parse is trusted
-- by the DB. CHECKs below are purely numeric / structural invariants that
-- cannot drift by rename.

create table if not exists public.weekly_reflections (
  reflection_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generated_at timestamptz not null default now(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  input_entry_count int not null check (input_entry_count >= 0),
  input_window_days int not null default 28 check (input_window_days > 0),
  generator_version text not null,
  prompt_version text not null,
  ai_json jsonb not null,
  ai_duration_ms int not null check (ai_duration_ms >= 0),
  check (period_end >= period_start)
);

create index if not exists weekly_reflections_user_generated_idx
  on public.weekly_reflections (user_id, generated_at desc);

alter table public.weekly_reflections enable row level security;

-- Users can SELECT their own rows. No INSERT/UPDATE/DELETE policies —
-- the /api/insights/generate route writes via the service-role client,
-- and we never expose mutations to clients. If you need to regenerate,
-- the writer inserts a new row; old rows are retained for history.
create policy "weekly_reflections_select_own" on public.weekly_reflections
  for select using (auth.uid() = user_id);
