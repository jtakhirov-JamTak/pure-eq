-- Net-zero successful generations (expect ZERO rows). Weekly check.
--
-- Detection for the two deferred coin-concurrency leaks (see
-- docs/implementation_plan_2026_06.md item 3 — lease deferred 2026-06-11):
--   1. Concurrent under-charge: an 'already_applied' sibling generates
--      unbilled while the charged sibling fails and refunds.
--   2. Orphaned debit refund mismatch.
--
-- A row = AI output was delivered but the coin ledger for that entry's
-- generation attempts sums to >= 0 (debits are negative delta, refunds
-- positive — a correctly billed success nets to -cost).
--
-- Built-in exclusions (no false positives expected):
--   - Admins: bypass the debit entirely → no gen txns → never join.
--   - Legit retries: attempt 0 refunded + attempt 1 charged nets to -cost.
--   - saveWarning (refunded, output NOT saved): ai_*_json stays null.
--   - Insights refusals: refunded BY DESIGN → only mode='reflection' counts.
--
-- REVISIT TRIGGER: fires more than ~once/month post-launch → build the
-- generation lease (design notes in the plan doc).
--
-- Validated against prod 2026-06-11 (0 rows). Column names verified against
-- src/types/database.ts the same day — re-verify on schema change.

with gen_net as (
  select
    user_id,
    split_part(ref_key, ':gen:', 1) as idem_key,
    sum(delta) as net_coins
  from coin_transactions
  where ref_key like '%:gen:%'
    and ref_key not like 'weekly_insights:%'
  group by 1, 2
),
delivered as (
  select r.user_id, r.source_session_id as idem_key, r.record_type, r.created_at
  from raw_records r
  where exists (select 1 from prepare_entries        d where d.raw_record_id = r.raw_record_id and d.ai_plan_json       is not null)
     or exists (select 1 from review_entries         d where d.raw_record_id = r.raw_record_id and d.ai_reflection_json is not null)
     or exists (select 1 from pulse_check_entries    d where d.raw_record_id = r.raw_record_id and d.ai_output_json     is not null)
     or exists (select 1 from before_you_send_entries d where d.raw_record_id = r.raw_record_id and d.ai_verdict_json   is not null)
)
select d.user_id, d.record_type, d.idem_key, d.created_at, g.net_coins
from delivered d
join gen_net g using (user_id, idem_key)
where g.net_coins >= 0

union all

-- Weekly Insights (spend base = weekly_insights:<user_id>:<utc-date>).
select
  w.user_id,
  'weekly_insights' as record_type,
  g.idem_key,
  w.generated_at as created_at,
  g.net_coins
from (
  select
    user_id,
    split_part(ref_key, ':gen:', 1) as idem_key,
    split_part(ref_key, ':', 3)::date as gen_date,
    sum(delta) as net_coins
  from coin_transactions
  where ref_key like 'weekly_insights:%:gen:%'
  group by 1, 2, 3
) g
join weekly_reflections w
  on w.user_id = g.user_id
 and w.generated_at::date = g.gen_date
 and w.ai_json->>'mode' = 'reflection'
where g.net_coins >= 0;
