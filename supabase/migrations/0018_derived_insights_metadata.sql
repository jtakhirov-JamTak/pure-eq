-- Migration 0018: derived_insights metadata + CHECK relaxation
--
-- Part 1: Add metadata_json column.
-- PatternCard snapshots (compute output) are stored here so cache read and
-- live compute both produce the same shape. insight_type-specific blob;
-- supporting_pattern_ids stays what its name says (array of tag refs).
--
-- Part 2: Relax three CHECK constraints on derived_insights.
-- Migration 0003 defined constraints against symbol names the writer never
-- produced ('recurring_blind_spot' vs 'blind_spot', 'emerging_pattern' vs
-- 'emerging', 'thirty_day/ninety_day/lifetime' vs 'all_time'). Every
-- insights-writer INSERT has been silently failing, masked by the page's
-- fallthrough-to-live-compute. Relax constraints to match actual writer values,
-- including the new 'top_pattern' insight_type introduced in this spec.

alter table public.derived_insights
  add column if not exists metadata_json jsonb;

alter table public.derived_insights
  drop constraint if exists derived_insights_insight_type_check;

alter table public.derived_insights
  add constraint derived_insights_insight_type_check
  check (insight_type in ('top_pattern', 'person_pattern'));

alter table public.derived_insights
  drop constraint if exists derived_insights_confidence_level_check;

alter table public.derived_insights
  add constraint derived_insights_confidence_level_check
  check (confidence_level in ('emerging', 'established'));

alter table public.derived_insights
  drop constraint if exists derived_insights_time_window_type_check;

alter table public.derived_insights
  add constraint derived_insights_time_window_type_check
  check (time_window_type in ('all_time'));
