# Implementation Plan — post-review (2026-06-11)

Supersedes the "Top 3 Implementation Briefs" (coin lease / push layer / CI rail).
Those briefs went through an adversarial review; the verdict was checked claim-by-claim
against main and this plan is the stable final position. Decision trail in short:

- **Brief 1 (coin generation lease): DEFERRED.** Both leaks are real (the
  concurrent under-charge is even documented as a known tradeoff in
  `src/lib/coach/billed-generation.ts`), but the severity framing was wrong:
  low frequency, 4–6 coins per event, self-inflicted race, and the orphaned
  debit self-corrects on retry (the `already_applied` path consumes the dead
  charge). A new table + lease helper + wiring through both charge
  orchestrators is disproportionate pre-launch. Replaced by **detection**
  (item 3) and a **revisit trigger**. The "founder-approved" framing in the
  brief came from an earlier session that pre-dated this severity analysis.
- **Brief 2 (push layer): DEAD AS SPECCED.** Four factual anchors, three wrong:
  no service worker exists (manifest-only PWA — push is a from-scratch build),
  `check_window` lives ONLY on `pulse_check_entries` (migration 0042 — the brief
  hung it on Review/Repair), no user timezone is stored anywhere (timestamptz
  columns are not a user tz), and there is no `vercel.json`/cron setup — 15-minute
  crons additionally need Vercel Pro. Redesigned post-launch (item 4).
- **Brief 3 (CI e2e rail): PROCEEDS, AMENDED** (item 1). The migration-parity
  check is dropped for v1 — it assumed CLI migration tracking
  (`supabase_migrations.schema_migrations`) that this repo's apply path
  (SQL-editor / MCP `execute_sql`) does not populate.
- **New: Coach refund hardening (item 2).** The review confirmed Insights
  already refunds on a thrown error (`generate.ts` catch → refund if charged →
  rethrow) but Coach's equivalent surface — `persist` THROWING instead of
  resolving `{ error: true }` — is uncovered. Cheap to close.

**Session note (2026-06-11):** Brief 1 had been started before the verdict
landed — migration `0049_generation_leases.sql` was written and applied to prod.
On deferral it was fully rolled back: table dropped (verified 0 leftover),
migration file deleted, branch deleted. Prod and the repo are clean; `0049`
is a free migration number again.

## Execution order

**2 → 3 → 1**, with 4 post-launch. Items 2 and 3 are small, money-adjacent, and
have no prerequisites. Item 1 blocks on founder-manual setup (test Supabase
project + GitHub secrets), so it starts when those exist.

---

## Item 1 — CI e2e rail (amended Brief 3)

### Problem
`.github/workflows/ci.yml` hardwires `ALLOW_E2E_AGAINST_REMOTE: "1"` and feeds
production-shaped Supabase secrets to a single e2e spec (`e2e/login.spec.ts`).
All risk, near-zero coverage.

### Founder prerequisites (manual, before any code)
1. Create Supabase project `pure-eq-test` (free tier).
2. Apply all of `supabase/migrations/*` to it in order (same SQL-editor /
   MCP path used on prod — there is no CLI migration history to push).
3. Create one seed test user.
4. Add GitHub Actions secrets: `TEST_SUPABASE_URL`,
   `TEST_SUPABASE_PUBLISHABLE_KEY`, `TEST_SUPABASE_SECRET_KEY`,
   `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`.

### Code changes
1. **`ci.yml`:** point the e2e step's `NEXT_PUBLIC_SUPABASE_URL` / keys at the
   `TEST_*` secrets. **Delete `ALLOW_E2E_AGAINST_REMOTE` from the workflow
   entirely.** Set `DISABLE_AI=1` and `DISABLE_CHECKOUT=1` in the e2e env — no
   Anthropic/Stripe spend from CI, and the kill-switch UX copy becomes
   assertable (both flags verified to exist in `src/lib/kill-switch.ts`).
2. **Production guard** — `e2e/helpers/guard.ts`, imported by Playwright global
   setup: hard-fail if `NEXT_PUBLIC_SUPABASE_URL` contains the production
   project ref `ppklkrsotwckcqmsddcs`. This replaces the deleted env-var rail
   with one that cannot be toggled on. (The in-code
   `ALLOW_E2E_AGAINST_REMOTE` check in `e2e/helpers/auth.ts` is superseded by
   the guard — remove it in the same change.)
3. ~~Migration parity check~~ — **dropped for v1** (no CLI-tracked migration
   table to diff against). Revisit if test-vs-prod schema drift ever causes a
   confusing e2e failure; the remediation then is a db-check-style
   information_schema comparison, not `supabase migration list`.
4. **Expand coverage to a minimum honest set** (all non-AI, zero coin spend):
   - `auth.spec.ts` — login, protected-route redirect, logout (extend existing).
   - `nav.spec.ts` — Coach hub renders all module entries; bottom nav routes resolve.
   - `coach-manual.spec.ts` — complete a Pulse Check manual flow (no AI
     generation): fill fields, advance steps, save, entry appears in Conversations.
   - `kill-switch.spec.ts` — with `DISABLE_AI=1`, an AI generation attempt
     shows the "paused for maintenance" copy and balance is unchanged.
5. Each spec cleans up rows it created (service-role helper in `e2e/helpers/`,
   keyed to the seed user) so reruns are deterministic.

### Acceptance
- `grep ALLOW_E2E_AGAINST_REMOTE .github/workflows/ci.yml` → no match (and no
  match anywhere in `e2e/` either).
- Guard fails the suite when pointed at the prod ref (prove with a deliberate
  local run; note in PR body).
- 4 spec files, all green in CI against the test project.
- CI never holds `ANTHROPIC_API_KEY`/`STRIPE_*` in the e2e step env.

Branch: `chore/ci-e2e-isolation`, PR to main.

---

## Item 2 — Coach refund hardening (~10 lines + 1 test)

### Problem
In `src/lib/coach/billed-generation.ts`, nothing covers a **thrown** error in
the spend→refund window. The `generate` closure is internally try/caught (the
retry loop in `run-module.ts` resolves `aiOutput: null` on failure, which
refunds), so the realistic uncovered surface is `persist` throwing instead of
resolving `{ error: true }` — a fresh charge would then be stranded with no
refund. Insights already handles this shape (`src/lib/insights/generate.ts`
outer catch: refund if charged → rethrow); Coach should mirror it, per the
keep-both-orchestrators-symmetric rule (`project_coin_charge_dual_shape`).

### Change
Wrap the generate→persist section of `runBilledGeneration` in `try/catch`:
on a thrown error, if `coinsCharged && spendKey`, `await refundCoins(userId,
coinCost, spendKey)` (idempotent on the `:refund` key), then rethrow. No
behavior change on any existing resolved path.

### Test
Extend `src/lib/coach/__tests__/billed-generation.test.ts`: `persist` rejects →
`refundCoins` called once with the per-attempt spend key → the error propagates
to the caller. (Also assert the no-refund variant: `already_applied` spend +
`persist` throws → no refund, error still propagates.)

### Acceptance
`npx tsc --noEmit`, `npm run lint`, `npm test` green. Suite count +2.

---

## Item 3 — Coin lease DEFERRED, with detection (not silence)

### Decision
Do **not** build the generation-lease table/helper now. The two leaks it would
close are real but bounded:

- **Concurrent under-charge** (leak 1): needs the user to double-fire the same
  attempt key in the same window AND have the charged sibling fail while the
  unbilled sibling succeeds. Cost when it happens: one generation (4–20 coins)
  delivered net-free.
- **Orphaned debit** (leak 2): process death between spend and refund. Self-
  corrects on retry (the retry's spend hits `already_applied` and consumes the
  dead charge); harm is bounded to "user never retries."

### Detection (build now, ~1 hour)
Surface **net-zero successful generations**: entries whose AI output was
delivered but whose generation ledger nets to ≥ 0 coins.

Save as `analytics/net_zero_generation_check.sql` AND surface the count as a
card on the admin dashboard (`/admin`), with a cooldown-latched
`Sentry.captureMessage` when the count is > 0 (module-level 5-min latch, per
the rate-limit.ts pattern) — that gives Sentry signal with no new cron infra.

```sql
-- Net-zero successful generations (expect ZERO rows).
-- A row = AI output was delivered but the coin ledger for that entry's
-- generation attempts sums to >= 0 (debits are negative delta, refunds
-- positive — a correctly billed success nets to -cost).
-- Excludes admins automatically: admin generations write no gen txns at all,
-- so they never join. A legit retry (attempt 0 refunded, attempt 1 charged)
-- nets to -cost and is excluded.

-- Coach modules (per-entry idempotency key = raw_records.source_session_id)
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
-- IMPORTANT: refusal reflections are refunded BY DESIGN (the refusal row is
-- persisted, coins returned) — only mode='reflection' rows count as delivered,
-- otherwise every refusal week is a false positive.
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
```

(Column/table names verified against `src/types/database.ts` 2026-06-11:
`prepare_entries.ai_plan_json`, `review_entries.ai_reflection_json`,
`pulse_check_entries.ai_output_json`, `before_you_send_entries.ai_verdict_json`.
Re-verify at implementation time per `feedback_verify_column_via_generated_types`.)

### Revisit trigger
If the check fires more than **~once a month post-launch**, build the lease
then (the deferred design: `generation_leases` table keyed on the per-attempt
spend key, acquire-before-spend, expiry adoption for orphaned charges,
`try/finally` settle — and note the design must DELETE never-charged leases
rather than settling them, or an insufficient-balance retry reusing the same
spend key is permanently blocked). Detection costs an hour; prevention costs
the table.

**Do not substitute pg_advisory locks** — unsafe under Supabase pooled
connections.

---

## Item 4 — Push layer: post-launch, redesigned around what exists

Brief 2 is dead as specced (wrong anchors — see header). When picked up
post-launch, the redesign constraints are:

- **Trigger:** Pulse Check `check_window` (the only place a check window
  actually exists — migration 0042). The Review-nudge trigger needs its own
  product decision first since nothing stores "the prepared conversation's date."
- **Timezone:** capture the user's IANA tz at push-subscribe time (client
  `Intl.DateTimeFormat().resolvedOptions().timeZone`) and store it on the
  subscription row — nothing else in the schema knows the user's tz.
- **Service worker:** from scratch — the PWA is currently manifest-only.
- **Dispatch cadence:** daily cron, not 15-minute (Vercel Hobby-compatible),
  OR Supabase pg_cron + an Edge Function (already proven viable by the
  `purge-soft-deleted-daily` job).
- Carry over Brief 2's still-valid rules: contextual permission prompt (never
  on page load), `CRON_SECRET`-only dispatcher auth, `DISABLE_PUSH` kill
  switch, unique `(user_id, ref_key)` schedule idempotency, dead-subscription
  pruning, and the hard privacy rule — payloads carry generic copy + a deep
  link ID only, never person names or entry text (lock-screen content is not
  under RLS).
