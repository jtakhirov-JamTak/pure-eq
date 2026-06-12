-- Migration 0049: monthly_reports
--
-- One row per user per ~28 days. Stores the LLM-generated Monthly Report
-- (or a refusal row on safety trigger / insufficient evidence) plus a
-- server-computed companion snapshot (heatmap grid, focus history, top
-- patterns) in server_json. Mirrors weekly_reflections (0022/0031):
--
-- DELIBERATE DESIGN NOTE (same as 0022): no string-enum CHECK constraints.
-- ai_json.mode ("report" vs "refusal") is validated by Zod before INSERT;
-- mirroring enums into DB CHECKs is the exact drift trap migration 0018
-- had to unwind. CHECKs below are purely numeric / structural invariants.
--
-- report_index: 0-based count of the user's prior monthly reports at
-- generation time — drives the tone schedule (first report fully realistic,
-- second one gentler FRAMING, realistic from the third on). Stored so the
-- rendered report is traceable to the tone regime that produced it.

create table if not exists public.monthly_reports (
  report_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generated_at timestamptz not null default now(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  input_entry_count int not null check (input_entry_count >= 0),
  input_window_days int not null default 28 check (input_window_days > 0),
  report_index int not null check (report_index >= 0),
  generator_version text not null,
  prompt_version text not null,
  ai_json jsonb not null,
  server_json jsonb not null,
  ai_duration_ms int not null check (ai_duration_ms >= 0),
  check (period_end >= period_start)
);

create index if not exists monthly_reports_user_generated_idx
  on public.monthly_reports (user_id, generated_at desc);

-- Same-day, same-version double-INSERT (two racing requests both missing the
-- cache) collapses to one row; the loser catches 23505 and returns the
-- winner's row as cached. Version in the key so a generator bump can insert a
-- fresh row the same day (the 0031 lesson, applied from day one).
create unique index if not exists monthly_reports_user_day_version_idx
  on public.monthly_reports (
    user_id,
    ((generated_at at time zone 'UTC')::date),
    generator_version
  );

alter table public.monthly_reports enable row level security;

-- Users can SELECT their own rows. No INSERT/UPDATE/DELETE policies —
-- /api/insights/monthly-report writes via the service-role client.
create policy "monthly_reports_select_own" on public.monthly_reports
  for select using (auth.uid() = user_id);

notify pgrst, 'reload schema';
