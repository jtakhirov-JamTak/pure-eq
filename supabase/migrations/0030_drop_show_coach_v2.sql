-- Migration 0030: Drop show_coach_v2 feature flag
--
-- Coach v2 was superseded by the Coach redesign (migrations 0025–0029:
-- Prepare Path A / Path B, Before You Send, Review w/ embedded Repair).
-- The redesign ships unconditionally for every user — there is no
-- v1 fallback to gate against, so the column has no readers.
--
-- `isLegacyV1` / `isRefusal` in src/lib/coach/output-shape.ts still
-- dispatch render branches per-row based on the payload shape; they
-- don't touch this flag.
--
-- Idempotent: `drop column if exists` succeeds on a DB that has
-- already had this column removed, or where 0021 never applied.
--
-- Rollback:
--   alter table public.user_feature_flags
--     add column if not exists show_coach_v2 boolean not null default false;

alter table public.user_feature_flags
  drop column if exists show_coach_v2;
