-- Migration 0023: archive retired tag-counter tables
--
-- The keyword-extractor / tag-counter Insights v1 system was retired in
-- Commits A-C of the weekly-reflection rollout. `pattern_observations` and
-- `derived_insights` have received no new writes since Commit A landed.
-- Renaming rather than dropping preserves the historical data — heuristic
-- tags produced from Coach AI output and Tools submissions — in case a
-- future analysis wants to revisit the v1 era. Storage cost is negligible
-- at current scale.
--
-- RLS policies, indexes, foreign keys, and CHECK constraints travel with
-- the rename, so the archive tables remain SELECT-scoped to their owners.
-- No writers reference these tables in src/ after Commit A.

alter table public.pattern_observations rename to pattern_observations_v1_archive;
alter table public.derived_insights rename to derived_insights_v1_archive;

-- The show_comparator feature flag was a UI-side knob for the retired
-- comparator math in /insights. No UI references remain; no archival value
-- (it was always either true for test users or absent). Drop the column.
alter table public.user_feature_flags drop column if exists show_comparator;
