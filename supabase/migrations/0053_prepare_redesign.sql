-- 0053: Prepare redesign 2026-06-13 — new input fields.
-- The redesign grows Prepare to 10 one-question screens and replaces the
-- single conversation_move chip with a richer "what outcome are you seeking?"
-- picker (primary + optional secondary), plus three new reflective inputs.
--
-- Additive + nullable + idempotent (additive-then-deprecate). Nothing is
-- dropped: conversation_move stays (dormant — legacy/export reads only); the
-- new posts simply stop writing it.
--
-- New columns:
--   conversation_type_primary    — required outcome (8-value taxonomy)
--   conversation_type_secondary  — optional second outcome (same taxonomy)
--   feeling_and_why              — scaffolded "I feel… because… this matters
--                                  because…" (identity)
--   my_pattern                   — "when I feel that, what do I do that gets
--                                  in the way?"
--   their_feeling_want           — "based on what you've observed, what might
--                                  they feel/want, what outcome are they after?"
--
-- "Name the fairest version of their side" reuses the existing fairest_version
-- column (reworded prompt only). The opener / trigger_plan / hidden_ask_and_floor
-- / situation_text columns are unchanged.

alter table public.prepare_entries
  add column if not exists conversation_type_primary text
    check (conversation_type_primary in (
      'understand', 'decide', 'connect', 'align',
      'repair', 'listen', 'collaborate', 'deliver'
    ));
alter table public.prepare_entries
  add column if not exists conversation_type_secondary text
    check (conversation_type_secondary in (
      'understand', 'decide', 'connect', 'align',
      'repair', 'listen', 'collaborate', 'deliver'
    ));
alter table public.prepare_entries
  add column if not exists feeling_and_why text;
alter table public.prepare_entries
  add column if not exists my_pattern text;
alter table public.prepare_entries
  add column if not exists their_feeling_want text;

-- The redesigned flow stamps path = 'lean_v2' (input-shape discriminator;
-- ai_plan_version stays the authoritative OUTPUT-shape selector, unchanged at
-- 9 because the AI cards are not changing this round). Widen the CHECK
-- additively, same idempotent drop-then-re-add as migration 0040.
alter table public.prepare_entries
  drop constraint if exists prepare_entries_path_check;
alter table public.prepare_entries
  add constraint prepare_entries_path_check
    check (path is null or path = any (array['path_a', 'path_b', 'lean_v1', 'lean_v2']));

notify pgrst, 'reload schema';

comment on column public.prepare_entries.conversation_type_primary is
  'Prepare redesign 2026-06-13. Primary sought outcome: understand/decide/connect/align/repair/listen/collaborate/deliver. Feeds buildPreparePrompt. NULL on pre-redesign rows.';
comment on column public.prepare_entries.conversation_type_secondary is
  'Prepare redesign 2026-06-13. Optional second sought outcome (same taxonomy as primary). NULL when the user picked only one.';
comment on column public.prepare_entries.feeling_and_why is
  'Prepare redesign 2026-06-13. Scaffolded I-feel/because/this-matters-because input (identity: what it says about you, them, or us).';
comment on column public.prepare_entries.my_pattern is
  'Prepare redesign 2026-06-13. "When I feel that, what do I do that gets in the way?" — the users own pattern under the emotion.';
comment on column public.prepare_entries.their_feeling_want is
  'Prepare redesign 2026-06-13. Observed read of the other side: what they might feel/want and the outcome they are probably after.';
