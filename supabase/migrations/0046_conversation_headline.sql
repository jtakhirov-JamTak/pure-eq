-- Conversations list perf: store a derived `ai_headline` string per threaded
-- Coach entry so the "all conversations" read selects one short column instead
-- of the full AI jsonb blob (previously fetched ×100 threads ×3 derived tables
-- just to extract a single headline string via extractHeadline()).
--
-- The headline field per module mirrors src/lib/coach/conversation-summary.ts
-- extractHeadline(): prepare→pressure_check, review→pattern_data,
-- pulse_check→signal_vs_noise; a refusal row (mode = 'refusal') surfaces
-- message_to_user. New rows are populated at generation time by run-module.ts
-- (via the same extractHeadline, single source of truth). If a module's AI
-- output shape ever renames its headline field, bump the writer AND re-run a
-- backfill like the one below.
--
-- Additive + nullable + backfilled => safe and reversible (drop column).

alter table public.prepare_entries add column if not exists ai_headline text;
alter table public.review_entries add column if not exists ai_headline text;
alter table public.pulse_check_entries add column if not exists ai_headline text;

-- Backfill existing rows. ->>'key' yields NULL when the key is absent, and
-- nullif(btrim(...), '') collapses whitespace-only / empty to NULL — matching
-- extractHeadline's trim-and-drop-empty semantics. Idempotent: only fills rows
-- whose ai_headline is still NULL.
update public.prepare_entries set ai_headline =
  case when ai_plan_json->>'mode' = 'refusal'
       then nullif(btrim(ai_plan_json->>'message_to_user'), '')
       else nullif(btrim(ai_plan_json->>'pressure_check'), '') end
  where ai_plan_json is not null and ai_headline is null;

update public.review_entries set ai_headline =
  case when ai_reflection_json->>'mode' = 'refusal'
       then nullif(btrim(ai_reflection_json->>'message_to_user'), '')
       else nullif(btrim(ai_reflection_json->>'pattern_data'), '') end
  where ai_reflection_json is not null and ai_headline is null;

update public.pulse_check_entries set ai_headline =
  case when ai_output_json->>'mode' = 'refusal'
       then nullif(btrim(ai_output_json->>'message_to_user'), '')
       else nullif(btrim(ai_output_json->>'signal_vs_noise'), '') end
  where ai_output_json is not null and ai_headline is null;

notify pgrst, 'reload schema';
