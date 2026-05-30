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

comment on column public.prepare_entries.conversation_move is
  'Lean Prepare (redesign). What kind of conversation this is: clarify/ask/boundary/share/decide/pause. Routing chip; feeds buildPreparePrompt. NULL on legacy rows.';
comment on column public.prepare_entries.hidden_ask_and_floor is
  'Lean Prepare (redesign). Merged field: what the user is secretly hoping for AND what would be good enough. Supersedes the separate hidden_expectation + outcome_floor inputs (both kept nullable for legacy /history reads).';
