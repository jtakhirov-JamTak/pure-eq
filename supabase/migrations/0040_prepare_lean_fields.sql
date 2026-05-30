-- Migration 0040: Prepare lean-form columns (vertical Prepare slice).
--
-- The redesign trims Prepare to an 8-field default (plan §11 Slice C, pulled
-- into the Prepare vertical slice). Two of those 8 need new columns:
--   conversation_move   — new routing chip (clarify/ask/boundary/share/
--                         decide/pause). No existing column fit.
--   hidden_ask_and_floor — merges the old hidden_expectation + outcome_floor
--                         into one field ("what are you secretly hoping for —
--                         and what would be good enough?").
--
-- Additive + nullable + idempotent (CLAUDE.md additive-then-deprecate):
--   - The old hidden_expectation / outcome_floor / specific_shift /
--     neutral_check_question / predicted_reaction / emotion_as_data /
--     default_pattern / observed_from_them / their_state_hedged columns are
--     NOT dropped. They stay nullable so legacy /history rows still render.
--     New lean-form posts simply stop writing most of them.
--   - predicted_reaction stays, but its WRITER changes: it is now populated
--     from the AI "Predicted Reaction" card (Quick tier) instead of a user
--     input, so the existing Prepare->Review calibration link (calibration.ts
--     reads predicted_reaction) keeps working unchanged.
-- Founder applies once via Supabase SQL Editor, then runs `supabase gen types`.

alter table public.prepare_entries
  add column if not exists conversation_move text
    check (conversation_move in (
      'clarify', 'ask', 'boundary', 'share', 'decide', 'pause'
    ));
alter table public.prepare_entries
  add column if not exists hidden_ask_and_floor text;

-- The lean flow stamps prepare_entries.path = 'lean_v1' as a legacy
-- filter-by-path discriminator (ai_plan_version = 9 is the authoritative
-- shape selector; path is kept non-null so old filter-by-path queries don't
-- drop new rows). The original prepare_entries_path_check only allowed
-- 'path_a'/'path_b', so the insert 400'd ("violates check constraint
-- prepare_entries_path_check") and the whole Prepare submit failed. Extend
-- the CHECK additively to include 'lean_v1'. Idempotent: drop-if-exists then
-- re-add so a replay lands the widened constraint.
alter table public.prepare_entries
  drop constraint if exists prepare_entries_path_check;
alter table public.prepare_entries
  add constraint prepare_entries_path_check
    check (path is null or path = any (array['path_a', 'path_b', 'lean_v1']));

-- PostgREST caches the schema; reload so the widened constraint + new columns
-- are picked up without the ~10-min stale-cache window.
notify pgrst, 'reload schema';

comment on column public.prepare_entries.conversation_move is
  'Lean Prepare (redesign). What kind of conversation this is: clarify/ask/boundary/share/decide/pause. Routing chip; feeds buildPreparePrompt. NULL on legacy rows.';
comment on column public.prepare_entries.hidden_ask_and_floor is
  'Lean Prepare (redesign). Merged field: what the user is secretly hoping for AND what would be good enough. Supersedes the separate hidden_expectation + outcome_floor inputs (both kept nullable for legacy /history reads).';
