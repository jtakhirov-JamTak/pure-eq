-- Migration 0021: Coach v2 rollout feature flag
--
-- Adds show_coach_v2 to public.user_feature_flags. Gates the v2-shape
-- renderer (refusal branch + normal-mode discriminated union landing in
-- later Coach v2 commits) behind a per-user opt-in. Default false, so
-- existing users keep rendering legacy v1 output until explicitly
-- flipped.
--
-- Same pattern as show_comparator (migration 0019): service-role writes
-- only — no INSERT/UPDATE/DELETE policies for user sessions. Flag is
-- flipped via direct DB update from the service role until an admin UI
-- exists.
--
-- Renderers dispatch via `isLegacyV1` / `isRefusal` in
-- src/lib/coach/output-shape.ts — no DB read is needed to pick the
-- render branch for a given output object. This flag gates the
-- user-facing rollout (which prompt + schema version gets invoked for
-- a user), not the per-row render discrimination.
--
-- Regenerate TypeScript types after applying:
--   npm run db:types
--
-- Rollback:
--   alter table public.user_feature_flags drop column if exists show_coach_v2;

alter table public.user_feature_flags
  add column if not exists show_coach_v2 boolean not null default false;
