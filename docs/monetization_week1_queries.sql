-- Pure EQ — Week-1 monetization measurement queries.
-- All four queries use only existing tables: raw_records, user_profiles,
-- user_subscriptions. No telemetry tables, no paywall_events table.

-- 1. Users who completed at least 1 Prepare AND 1 Review
--    within 7 days of onboarding completion.
with onboarding as (
  select user_id, min(created_at) as profile_created_at
  from public.user_profiles
  group by user_id
),
first_prepare as (
  select user_id, min(completed_at) as first_completed_at
  from public.raw_records
  where record_type = 'prepare' and is_complete = true and deleted_at is null
  group by user_id
),
first_review as (
  select user_id, min(completed_at) as first_completed_at
  from public.raw_records
  where record_type = 'review' and is_complete = true and deleted_at is null
  group by user_id
)
select count(*) as users_with_prepare_and_review_in_7d
from onboarding o
join first_prepare p
  on p.user_id = o.user_id
 and p.first_completed_at <= o.profile_created_at + interval '7 days'
join first_review r
  on r.user_id = o.user_id
 and r.first_completed_at <= o.profile_created_at + interval '7 days';

-- 2. Of those users (from query 1), the percent who later reached
--    status='active' (any time after profile creation).
with onboarding as (
  select user_id, min(created_at) as profile_created_at
  from public.user_profiles
  group by user_id
),
first_prepare as (
  select user_id, min(completed_at) as first_completed_at
  from public.raw_records
  where record_type = 'prepare' and is_complete = true and deleted_at is null
  group by user_id
),
first_review as (
  select user_id, min(completed_at) as first_completed_at
  from public.raw_records
  where record_type = 'review' and is_complete = true and deleted_at is null
  group by user_id
),
qualified as (
  select o.user_id
  from onboarding o
  join first_prepare p
    on p.user_id = o.user_id
   and p.first_completed_at <= o.profile_created_at + interval '7 days'
  join first_review r
    on r.user_id = o.user_id
   and r.first_completed_at <= o.profile_created_at + interval '7 days'
)
select
  count(*) as qualified_users,
  count(*) filter (where s.status = 'active') as qualified_active,
  round(
    100.0 * count(*) filter (where s.status = 'active') / nullif(count(*), 0),
    2
  ) as pct_activated
from qualified q
left join public.user_subscriptions s on s.user_id = q.user_id;

-- 3. Users whose FIRST completed module was a Tool (overwhelmed or
--    trigger_log) and the percent who later completed at least one Prepare.
with first_completed as (
  select distinct on (user_id)
    user_id, record_type, completed_at
  from public.raw_records
  where is_complete = true
    and deleted_at is null
    and record_type in ('prepare','review','repair','overwhelmed','trigger_log')
  order by user_id, completed_at asc
),
tool_first as (
  select user_id
  from first_completed
  where record_type in ('overwhelmed','trigger_log')
),
ever_prepared as (
  select distinct user_id
  from public.raw_records
  where record_type = 'prepare' and is_complete = true and deleted_at is null
)
select
  count(*) as users_started_with_tool,
  count(*) filter (where e.user_id is not null) as later_did_prepare,
  round(
    100.0 * count(*) filter (where e.user_id is not null) / nullif(count(*), 0),
    2
  ) as pct_later_prepared
from tool_first t
left join ever_prepared e on e.user_id = t.user_id;

-- 4. Post-tools-window unpaid-to-paid conversion proxy.
--    NOT a true paywall-hit funnel. This is the cohort whose Tools window
--    has already closed (profile.created_at > 7 days ago) and who currently
--    either have no active subscription or have since activated.
--    The ratio tells us how many in that cohort converted.
with onboarding as (
  select user_id, min(created_at) as profile_created_at
  from public.user_profiles
  group by user_id
),
cohort as (
  select
    o.user_id,
    o.profile_created_at,
    coalesce(s.status, 'none') as current_status
  from onboarding o
  left join public.user_subscriptions s on s.user_id = o.user_id
  where o.profile_created_at < now() - interval '7 days'
)
select
  count(*) filter (where current_status not in ('trial_active','active')) as denominator_post_window_unpaid,
  count(*) filter (where current_status = 'active') as numerator_later_activated,
  round(
    100.0 * count(*) filter (where current_status = 'active') /
      nullif(count(*) filter (where current_status not in ('trial_active','active'))
             + count(*) filter (where current_status = 'active'), 0),
    2
  ) as pct_post_tools_window_converted
from cohort;
