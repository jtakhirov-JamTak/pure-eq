-- Migration 0024: unique index on weekly_reflections (user_id, generated-date-UTC).
--
-- Defends against concurrent double-INSERT from parallel POSTs that both
-- miss the 7-day idempotency cache (e.g. two tabs, retry storm, client bug
-- loop). Without this, two requests each pay for an Opus call (~$0.30
-- wasted) and the LATER row wins on the next cache read.
--
-- Why (user_id, date-UTC): the realistic race is two requests within
-- seconds of each other, never days apart. A per-day unique is tight
-- enough for the race window without constraining legitimate re-runs
-- that happen days apart inside the same 7-day window (which shouldn't
-- happen, but if they do — e.g. generator_version bump mid-week — they
-- should not be rejected here).
--
-- (generated_at AT TIME ZONE 'UTC')::date is immutable (timestamp→date,
-- no session tz dep) so postgres accepts it in an expression index.
--
-- ON-CONFLICT HANDLING: src/lib/insights/generate.ts catches PG code 23505
-- and re-reads the winning row via readCachedReflection(). The loser of
-- the race returns {status:"cached"} with the first writer's row.
--
-- PRE-FLIGHT DEDUP: this table is fresh (migration 0022, ~1 day old) with
-- very few rows. A dedup CTE is still cheap defense against a future
-- retroactive replay of this migration; it is idempotent on a clean DB.
-- Rule captured in Engineering Playbook §16.* (unique-index migrations).

with ranked as (
  select
    reflection_id,
    row_number() over (
      partition by user_id, ((generated_at at time zone 'UTC')::date)
      order by generated_at asc
    ) as rn
  from public.weekly_reflections
)
delete from public.weekly_reflections
where reflection_id in (select reflection_id from ranked where rn > 1);

create unique index if not exists weekly_reflections_user_day_idx
  on public.weekly_reflections (user_id, ((generated_at at time zone 'UTC')::date));
