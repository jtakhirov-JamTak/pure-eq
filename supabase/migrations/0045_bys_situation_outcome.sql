-- Migration 0045: BYS lean 3-question inputs.
--
-- The redesigned Before You Send flow collects three required inputs —
-- situation facts, desired outcome, and the draft — replacing the
-- message_type / risk_context / intent_optional inputs in the UI. message_type
-- stays server-side (defaulted to 'conflict', never asked) so its CHECK stays
-- satisfied; risk_context / intent_optional remain as nullable legacy columns
-- (new writes set them NULL). See docs/handoff_bys_loop_router.md Phase 1.
--
-- Two additive nullable columns. Old rows keep NULL; no backfill, no CHECK,
-- no unique index → safe to apply with existing data present.
--
-- The ai_verdict_json output shape also changes (3 new cards: main_risk,
-- cleaner_version, why_this_works) but that column is freeform jsonb and needs
-- no migration — the shape change is versioned in code via
-- ai_verdict_version 2 -> 3.

alter table public.before_you_send_entries
  add column if not exists situation_facts text,
  add column if not exists desired_outcome text;

notify pgrst, 'reload schema';
