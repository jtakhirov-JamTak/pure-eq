-- Migration 0038: ai_tier column on every Coach derived table.
--
-- Slice A of the coins/redesign work (plan jiggly-scribbling-ripple.md §11).
-- The AI feedback layer is moving from a single fixed card set per module to
-- two tiers:
--   quick — 3 cards
--   deep  — 5 cards
-- ai_tier records which tier produced a given entry's AI output, so /history,
-- analytics, and the (future) coin ledger can distinguish a 4-coin Quick run
-- from a 6-coin Deep run.
--
-- All adds are nullable + idempotent (CLAUDE.md additive-then-deprecate rule):
--   - Legacy rows (written before this slice) stay NULL — they predate tiering
--     and the renderer treats NULL as "legacy single-tier output".
--   - No CHECK changes to existing columns; no renames; no drops.
-- Founder applies once via the Supabase SQL Editor, then runs
-- `supabase gen types` locally so the generated database.ts picks up the
-- new column before the Slice-A code that writes it lands.

alter table public.prepare_entries
  add column if not exists ai_tier text
    check (ai_tier in ('quick', 'deep'));
alter table public.review_entries
  add column if not exists ai_tier text
    check (ai_tier in ('quick', 'deep'));
alter table public.before_you_send_entries
  add column if not exists ai_tier text
    check (ai_tier in ('quick', 'deep'));
alter table public.pulse_check_entries
  add column if not exists ai_tier text
    check (ai_tier in ('quick', 'deep'));
alter table public.repair_entries
  add column if not exists ai_tier text
    check (ai_tier in ('quick', 'deep'));

comment on column public.prepare_entries.ai_tier is
  'Slice A (coins redesign). Which AI feedback tier produced ai_plan_json: quick (3 cards) or deep (5 cards). NULL = legacy pre-tiering row.';
comment on column public.review_entries.ai_tier is
  'Slice A (coins redesign). Which AI feedback tier produced ai_reflection_json: quick (3 cards) or deep (5 cards). NULL = legacy pre-tiering row.';
comment on column public.before_you_send_entries.ai_tier is
  'Slice A (coins redesign). Which AI feedback tier produced ai_verdict_json: quick (3 cards) or deep (5 cards). NULL = legacy pre-tiering row.';
comment on column public.pulse_check_entries.ai_tier is
  'Slice A (coins redesign). Which AI feedback tier produced ai_output_json: quick (3 cards) or deep (5 cards). NULL = legacy pre-tiering row.';
comment on column public.repair_entries.ai_tier is
  'Slice A (coins redesign). Which AI feedback tier produced ai_strategy_json: quick (3 cards) or deep (5 cards). NULL = legacy pre-tiering row.';
