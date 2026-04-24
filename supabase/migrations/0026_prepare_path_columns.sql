-- Migration 0026: prepare_entries — Path A / Path B + new fields + pattern_tag.
--
-- Coach redesign splits Prepare into two entry paths:
--   Path A — "I need to have a conversation" (9 fields: classic talk-prep)
--   Path B — "Something feels off" (7 fields: early-detection)
--
-- Strategy: add a `path` discriminator column + new nullable fields per path.
-- Existing rows are backfilled to 'path_a' (the legacy 9-field shape they
-- match). Legacy columns (situation_text, desired_outcome, etc.) stay in
-- place — Path A continues to use them; Path B writes its own new columns
-- and leaves the legacy ones NULL.
--
-- Pre-launch we have only the founder's test data, so the backfill is
-- effectively a no-op of size 1. The CHECK constraint is added AFTER the
-- backfill so the migration succeeds even if a stray row exists.
--
-- pattern_tag is re-introduced (display-only for v1; future Insights
-- consumption is an open path — see plan fizzy-cuddling-biscuit.md).

-- 1. Add path discriminator (nullable initially so backfill can complete).
alter table public.prepare_entries
  add column if not exists path text;

-- 2. Backfill existing rows. They were all written under the legacy 9-field
-- shape that matches Path A.
update public.prepare_entries
  set path = 'path_a'
  where path is null;

-- 3. Add CHECK now that all rows have a valid value. Allow NULL so an
-- in-flight insert without path doesn't fail mid-deploy; route validation
-- enforces non-NULL at the application boundary.
alter table public.prepare_entries
  drop constraint if exists prepare_entries_path_check;
alter table public.prepare_entries
  add constraint prepare_entries_path_check
  check (path is null or path in ('path_a', 'path_b'));

-- 4. Path A new fields.
alter table public.prepare_entries
  add column if not exists their_need text;
alter table public.prepare_entries
  add column if not exists how_to_make_them_feel text;

-- 5. Path B new fields.
alter table public.prepare_entries
  add column if not exists what_feels_off text;
alter table public.prepare_entries
  add column if not exists what_changed text;
alter table public.prepare_entries
  add column if not exists story_telling_yourself text;
alter table public.prepare_entries
  add column if not exists afraid_it_means text;

-- 6. pattern_tag (re-introduced, display-only for v1).
alter table public.prepare_entries
  add column if not exists pattern_tag text;

-- 7. Document deprecated fields. The redesigned Prepare prompt no longer
-- consumes desired_outcome — Path A asks "what do you want them to feel
-- by the end" instead (how_to_make_them_feel). Existing rows keep their
-- desired_outcome value for /history reads; new Path A writes leave it null.
comment on column public.prepare_entries.desired_outcome is
  'DEPRECATED 2026-04-23 (Coach redesign). Replaced by how_to_make_them_feel on Path A. Kept nullable for legacy /history reads.';
