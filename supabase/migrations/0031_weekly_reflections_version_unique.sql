-- Migration 0031: include generator_version in the weekly_reflections unique index.
--
-- Migration 0024 created a unique index on (user_id, date-UTC) to prevent
-- double-INSERT from concurrent same-day writers. Its own comment noted
-- that mid-week generator_version bumps "should not be rejected here" —
-- but a version-agnostic index DOES reject them: after a bump, a user
-- with a same-day v_old row cannot INSERT a new v_new row without the
-- app-layer catching 23505 and running an UPDATE fallback.
--
-- Encoding the invariant in the index is cleaner than app-layer remediation.
-- With generator_version in the key:
--   - Same-day, same-version double-INSERT still blocked (the original intent).
--   - Same-day, different-version INSERT proceeds normally. The stale v_old
--     row ages out of the 7-day idempotency window on its own; the reader's
--     generator_version filter makes it invisible.
--   - No UPDATE fallback, no race conditions between concurrent UPDATEers.
--
-- Pre-flight dedup first (defense against future replay on a dirty DB per
-- the Engineering Playbook pattern). Then DROP old index + CREATE new.
--
-- On-conflict handling in src/lib/insights/generate.ts simplifies to:
-- catch 23505 → readCachedReflection → return winner as cached. No UPDATE.

with ranked as (
  select
    reflection_id,
    row_number() over (
      partition by user_id,
                   ((generated_at at time zone 'UTC')::date),
                   generator_version
      order by generated_at asc
    ) as rn
  from public.weekly_reflections
)
delete from public.weekly_reflections
where reflection_id in (select reflection_id from ranked where rn > 1);

drop index if exists public.weekly_reflections_user_day_idx;

create unique index if not exists weekly_reflections_user_day_version_idx
  on public.weekly_reflections (
    user_id,
    ((generated_at at time zone 'UTC')::date),
    generator_version
  );
