-- Phase 0 — loop-demand baseline (read-only)
-- Branch: chore/loop-metric
--
-- PURPOSE: capture a PRE-Phase-1 snapshot of two funnels so the BYS restructure
-- (Phase 1) can be evaluated against a real baseline. Run BOTH queries in the
-- Supabase SQL editor and paste the results + run date below before Phase 1 ships.
--
-- These are plain SELECTs, not a CREATE VIEW, on purpose: the handoff authorizes
-- exactly one schema change (the Phase 1.1b BYS column add) and nothing else.
-- Read-only; safe to run against production any time.
--
-- "Completed" = the paid AI step happened, i.e. the derived ai_* json is non-null.
-- That's the conversion event that matters, not a free draft save.
--
-- ── SNAPSHOT LOG ──────────────────────────────────────────────────────────────
-- Run date: 2026-06-01 (pre-Phase-1 baseline, admin INCLUDED). Prod, read-only.
-- NOTE: this is pre-launch test data — effectively one real user (the founder/
-- admin). Not statistically meaningful; recorded only to establish the discipline
-- and prove the queries run. Re-run post-launch for a real baseline.
-- A (Prepare→Review): completed_prepares=14, with_followup_review=4 (28.6%),
--    users_with_prepare=1, users_followed_through=1 (100%), median_days=0.0
-- B (BYS funnel): total_signups(auth.users)=1*, onboarded(user_profiles)=4,
--    1+verdict=1, 2+=1, 3+repeat=1; onboarded→first=25.0%, first→second=100%
--    * auth.users=1 < profiles=4 via the MCP read role — a visibility/permission
--      artifact of the connection, not a data bug. Use onboarded(=4) as the
--      denominator until a real cohort exists.
-- ─────────────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════════════
-- A. Prepare → Review return rate (same person)
--    Of users who completed a Prepare, the share who later completed a Review
--    for the SAME person, plus the median days between.
--    (Matched on person_id. For a tighter signal you can swap to thread_id, or
--     use review_entries.linked_prepare_entry_id — the explicit calibration link.)
-- ════════════════════════════════════════════════════════════════════════════
with completed_prepares as (
  select user_id, person_id, prepare_entry_id, created_at
  from public.prepare_entries
  where ai_plan_json is not null
    and deleted_at is null
    and person_id is not null
),
completed_reviews as (
  select user_id, person_id, created_at
  from public.review_entries
  where ai_reflection_json is not null
    and deleted_at is null
    and person_id is not null
),
matched as (
  select
    cp.user_id,
    cp.person_id,
    cp.prepare_entry_id,
    cp.created_at as prepared_at,
    min(cr.created_at) as first_review_at
  from completed_prepares cp
  left join completed_reviews cr
    on  cr.user_id   = cp.user_id
    and cr.person_id = cp.person_id
    and cr.created_at >= cp.created_at
  group by cp.user_id, cp.person_id, cp.prepare_entry_id, cp.created_at
)
select
  count(*)                                                    as completed_prepares,
  count(*) filter (where first_review_at is not null)         as prepares_with_followup_review,
  round(100.0 * count(*) filter (where first_review_at is not null)
        / nullif(count(*), 0), 1)                             as pct_prepares_followed_by_review,
  count(distinct user_id)                                     as users_with_completed_prepare,
  count(distinct user_id) filter (where first_review_at is not null)
                                                              as users_with_followup_review,
  round(100.0 * count(distinct user_id) filter (where first_review_at is not null)
        / nullif(count(distinct user_id), 0), 1)              as pct_users_followed_through,
  round((percentile_cont(0.5) within group (
           order by extract(epoch from (first_review_at - prepared_at)) / 86400.0
         ))::numeric, 1)                                      as median_days_prepare_to_review
from matched;


-- ════════════════════════════════════════════════════════════════════════════
-- B. BYS funnel: onboarded users → 1st verdict → 2nd verdict → repeat (3+)
--    A "verdict" = a before_you_send_entries row with a non-null ai_verdict_json
--    (the paid coin-spend event). Admins get verdicts without spending coins, so
--    if you want a pure paying-user funnel, exclude the admin user_id (see note).
-- ════════════════════════════════════════════════════════════════════════════
with verdicts as (
  select user_id, count(*) as verdict_count
  from public.before_you_send_entries
  where ai_verdict_json is not null
    and deleted_at is null
  -- and user_id <> '<ADMIN_USER_ID>'::uuid   -- optional: exclude the admin account
  group by user_id
),
onboarded as (
  select user_id from public.user_profiles
)
select
  (select count(*) from auth.users)                          as total_signups,
  (select count(*) from onboarded)                           as onboarded_users,
  count(*) filter (where verdict_count >= 1)                 as users_1plus_verdict,
  count(*) filter (where verdict_count >= 2)                 as users_2plus_verdict,
  count(*) filter (where verdict_count >= 3)                 as users_3plus_verdict_repeat,
  round(100.0 * count(*) filter (where verdict_count >= 1)
        / nullif((select count(*) from onboarded), 0), 1)    as pct_onboarded_to_first_verdict,
  round(100.0 * count(*) filter (where verdict_count >= 2)
        / nullif(count(*) filter (where verdict_count >= 1), 0), 1)
                                                              as pct_first_to_second_verdict
from verdicts;
