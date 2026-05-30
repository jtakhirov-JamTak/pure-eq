-- Migration 0041: Review lean-form columns (vertical Review slice).
--
-- The redesign trims Review to a 7-field default (plan §11 Slice C3, pulled
-- into the Review vertical slice). Two of those 7 need new columns:
--   data_and_update — consolidates the old lesson_screen (3-field) +
--                     treat_as_data into one field ("what did this teach you —
--                     and what should change next time?").
--   next_move       — new routing chip with a leaner taxonomy than the old
--                     needs_to_happen_next (nothing/repair/prepare/
--                     set_boundary/follow_up/step_back/save_pattern).
--
-- Additive + nullable + idempotent (CLAUDE.md additive-then-deprecate):
--   - The old needs_to_happen_next / lesson_about_* / treat_as_data /
--     review_depth / calibration_block / what_protecting / forecast / repair-
--     branch columns are NOT dropped. They stay nullable so legacy /history
--     rows still render. New lean-form posts simply stop writing them
--     (review_depth is left NULL; ai_reflection_version = 10 is the
--     authoritative shape selector).
--   - The Prepare->Review calibration link is unchanged: the lean Review still
--     reads the linked Prepare's predicted_reaction server-side; only the
--     user-facing calibration chips are dropped.
--   - next_move is a NEW column with its OWN fresh CHECK (the superset is
--     defined here), so there is no reused-column CHECK trap like the
--     prepare_entries.path = 'lean_v1' incident (migration 0040 lesson).
--     review_entries has no `path` column — ai_reflection_version is the
--     discriminator.
-- Founder applies once via Supabase SQL Editor, then runs `supabase gen types`.

alter table public.review_entries
  add column if not exists data_and_update text;

alter table public.review_entries
  add column if not exists next_move text;

-- Fresh CHECK for the new column (drop-if-exists then re-add so a replay lands
-- the constraint). 7 lean next-move values; NULL allowed for legacy rows that
-- never wrote this column.
alter table public.review_entries
  drop constraint if exists review_entries_next_move_check;
alter table public.review_entries
  add constraint review_entries_next_move_check
    check (next_move is null or next_move = any (array[
      'nothing', 'repair', 'prepare', 'set_boundary',
      'follow_up', 'step_back', 'save_pattern'
    ]));

-- PostgREST caches the schema; reload so the new columns + constraint are
-- picked up without the ~10-min stale-cache window.
notify pgrst, 'reload schema';

comment on column public.review_entries.data_and_update is
  'Lean Review (redesign). Merged field: what this interaction taught the user AND what should change next time. Supersedes the separate lesson_about_them/self/differently + treat_as_data inputs (all kept nullable for legacy /history reads).';
comment on column public.review_entries.next_move is
  'Lean Review (redesign). Routing chip: nothing/repair/prepare/set_boundary/follow_up/step_back/save_pattern. Supersedes needs_to_happen_next (kept nullable for legacy reads + Insights behavioral-context aggregation). NULL on legacy rows.';
