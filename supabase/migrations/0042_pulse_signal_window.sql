-- Migration 0042: Pulse Check lean-form columns (vertical Pulse slice).
--
-- The redesign trims "Something feels off" to a 6-field default + 2 conditional
-- (plan §11 Slice C1, pulled into the Pulse vertical slice). Three of those need
-- new columns plus one realigned routing chip:
--   signal_test_confirm / signal_test_disconfirm
--                   — the old single-sided signal_noise_observation becomes a
--                     two-sided falsifiable test: what would CONFIRM this is real
--                     signal, and what would DISCONFIRM it (noise), over a 3–7 day
--                     window. Two columns so each side is queryable + so the Deep
--                     "Stop-Checking Rule" card can ground in both.
--   check_window    — when the user's next move is "observe", how long they'll
--                     watch before re-checking (24h / 3d / 7d / next_interaction).
--                     Powers the future Pulse-observe → follow-up nudge (Slice E).
--   next_move       — NEW routing chip with a leaner taxonomy than the old
--                     next_move_chip (do_nothing/observe/ask_light/prepare/
--                     repair/set_boundary/step_back).
--
-- Additive + nullable + idempotent (CLAUDE.md additive-then-deprecate):
--   - The old signal_noise_observation / next_move_chip / when_it_shifted /
--     feeling_text / body_location / theirs_not_about_you columns are NOT
--     dropped. They stay nullable so legacy /history rows still render. New
--     lean-form posts simply stop writing them. ai_output_version = 2 is the
--     authoritative shape selector (legacy single-tier rows = version 1/NULL).
--   - next_move is a NEW column with its OWN fresh CHECK (the superset is defined
--     here), so there is no reused-column CHECK trap like the
--     prepare_entries.path = 'lean_v1' incident (migration 0040 lesson).
--     pulse_check_entries has no `path` column — ai_output_version is the
--     discriminator.
--   - ai_tier already added in migration 0038; ai_card_edits already supports
--     'pulse_check_entries' (migration 0039). No change needed there.
-- Founder applies once via Supabase SQL Editor, then runs `supabase gen types`.

alter table public.pulse_check_entries
  add column if not exists signal_test_confirm text;

alter table public.pulse_check_entries
  add column if not exists signal_test_disconfirm text;

alter table public.pulse_check_entries
  add column if not exists check_window text;

alter table public.pulse_check_entries
  add column if not exists next_move text;

-- Fresh CHECK for the new check_window column (drop-if-exists then re-add so a
-- replay lands the constraint). NULL allowed for legacy rows + the common
-- non-observe case where no window applies.
alter table public.pulse_check_entries
  drop constraint if exists pulse_check_entries_check_window_check;
alter table public.pulse_check_entries
  add constraint pulse_check_entries_check_window_check
    check (check_window is null or check_window = any (array[
      '24h', '3d', '7d', 'next_interaction'
    ]));

-- Fresh CHECK for the new next_move column. 7 lean values; NULL allowed for
-- legacy rows that never wrote this column.
alter table public.pulse_check_entries
  drop constraint if exists pulse_check_entries_next_move_check;
alter table public.pulse_check_entries
  add constraint pulse_check_entries_next_move_check
    check (next_move is null or next_move = any (array[
      'do_nothing', 'observe', 'ask_light', 'prepare',
      'repair', 'set_boundary', 'step_back'
    ]));

-- PostgREST caches the schema; reload so the new columns + constraints are
-- picked up without the ~10-min stale-cache window.
notify pgrst, 'reload schema';

comment on column public.pulse_check_entries.signal_test_confirm is
  'Lean Pulse (redesign). Two-sided falsifiable test, confirm side: what the user would observe over 3–7 days that says this IS real signal. Supersedes single-sided signal_noise_observation (kept nullable for legacy /history). NULL on legacy rows.';
comment on column public.pulse_check_entries.signal_test_disconfirm is
  'Lean Pulse (redesign). Two-sided falsifiable test, disconfirm side: what the user would observe that says this is noise, not signal. NULL on legacy rows.';
comment on column public.pulse_check_entries.check_window is
  'Lean Pulse (redesign). Observation window when next_move = observe: 24h/3d/7d/next_interaction. Powers the future Pulse-observe follow-up nudge (Slice E). NULL when next_move is not observe or on legacy rows.';
comment on column public.pulse_check_entries.next_move is
  'Lean Pulse (redesign). Routing chip: do_nothing/observe/ask_light/prepare/repair/set_boundary/step_back. Supersedes next_move_chip (kept nullable for legacy reads). NULL on legacy rows.';
