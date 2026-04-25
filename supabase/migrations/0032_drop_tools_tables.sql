-- Migration 0032: drop Tools tables (Overwhelmed + Triggered).
--
-- Tools removed from product 2026-04-25. Full surface preserved at
-- the archive/with-tools branch + tag archive/with-tools-2026-04-25
-- on origin (resurrect via `git checkout archive/with-tools -- src/app/tools`).
--
-- Pre-launch, no real users — straight drop is acceptable. Founder
-- explicitly chose drop over rename-to-archive (compare migration 0023
-- which kept the v1 tag-counter tables; the difference here is no
-- expected analytical demand against this data).
--
-- record_type enum values 'trigger_log' and 'overwhelmed' are intentionally
-- left in place. Postgres enum value removal is a destructive migration
-- with no benefit here — no rows will reference them post-deletion, and
-- history / insights queries already filter to the remaining types.

drop table if exists public.overwhelmed_entries;
drop table if exists public.trigger_entries;
