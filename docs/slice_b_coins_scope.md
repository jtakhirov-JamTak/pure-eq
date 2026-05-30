# Slice B — Coins wallet + one-time payments (SCOPE, no code yet)

Authoritative economics: memory `project_coins_framework_final.md`. This doc is
the build plan derived from it. Supersedes the stale Slice B notes in
`jiggly-scribbling-ripple.md` §11 (which assumed "10 free Quick" + "$4.99=48" —
both dead).

## Target behavior
- **Free, no coins:** every module usable *manually* (Prepare/Review/Repair/
  Pulse/Before-Send), saving entries, History, Nudges. No trial windows.
- **Costs coins:** Quick AI = 4, Deep AI = 6, Weekly Insights = 20, Monthly
  Report = 80.
- **Signup grant:** 50 coins, once.
- **Buy (all ONE-TIME, no auto-renew):** Top-up $5/50, 1-Month EQ Pack $50/750,
  3-Month EQ Builder Pack $100/1500, optional EQ Builder Plus $129/2000.
- **Coins never expire.** Balance is a plain integer.

## What this REPLACES
- `subscriptionGate: "free_one"` + `freeUsageField` on every CoachModuleConfig.
- 3-day Coach / 7-day Tools free windows (`freePeriodActive`, `toolsWindowActive`).
- `reserveFreeUse` / `free_*_used_at` columns (kept dormant, not dropped).
- `/paywall` subscribe mock + `createSubscription`.
- `requirePaidAccessPage/Api`, `requireToolsAccessPage/Api` redirects → most
  become auth-only (pages are free to VIEW; only AI generation costs coins).
- `user_subscriptions` table stays **dormant, not dropped**, until coins proven.

## Build order (each sub-slice independently shippable + testable)

### B1 — Wallet + debit (coins only, no payments yet)
The 50-coin signup grant is the only way to get coins in B1, which lets us prove
the debit path end-to-end before money is involved.

1. **Migration 0043_coins_economy.sql** (next free number is 0043; the plan's
   "0038" is long consumed):
   - `coin_balances`: `user_id uuid PK → auth.users cascade`, `balance int NOT
     NULL DEFAULT 0 CHECK (balance >= 0)`, `created_at/updated_at`. RLS:
     select-own only; **no client insert/update/delete** (service-role writes).
   - `coin_transactions` (ledger/audit + idempotency): `transaction_id uuid PK`,
     `user_id → auth.users cascade`, `delta int NOT NULL`, `reason text CHECK in
     ('signup_grant','purchase','debit_quick','debit_deep',
     'debit_weekly_insights','debit_monthly_report','refund','admin_adjust')`,
     `ref_key text`, `balance_after int NOT NULL CHECK (>= 0)`, `created_at`.
     **Unique (user_id, ref_key) WHERE ref_key IS NOT NULL** — the idempotency
     guarantee for both debits and credits. RLS select-own; no client writes.
   - **Atomic `spend_coins` / `grant_coins` Postgres functions** (SECURITY
     DEFINER): in one transaction — read balance, verify (debit: balance >=
     cost), insert the txn row (unique ref_key dedupes), update balance. Returns
     'ok' | 'insufficient' | 'already_applied'. Doing the check+write in the DB
     (not app code) is what makes concurrent debits race-safe — same role the
     old `reserveFreeUse` atomic UPDATE played.
   - Migration tail: `notify pgrst, 'reload schema';`.
2. **Signup grant** — 50 coins, **one per authenticated user**, idempotent
   (`ref_key = 'signup_grant'`, unique per user → strict-mode double-fire and
   replays are no-ops). Trigger point = onboarding completion (profile save),
   matching where the old free-window anchor started.
   **Anti-abuse (founder Change 3 — DEFER, do not overbuild):** B1 ships
   idempotency only. Email/device/IP throttling + abuse monitoring come later,
   only if grant-farming via throwaway emails actually shows up. Revisit trigger:
   real signups exist AND a spike of single-grant-then-abandon accounts appears.
3. **`src/lib/coins.ts`** — `getBalance`, `grantCoins`, `spendCoins` wrappers
   over the RPCs (service role). Cost table: `{ quick: 4, deep: 6,
   weekly_insights: 20, monthly_report: 80 }` in one place.
4. **Separate FREE save from PAID AI (founder Change 2 — critical).** Today one
   submit saves raw+derived AND calls the AI in a single request. The free-manual
   model requires splitting these so a user can journal without being charged:
   - **"Save entry" = free.** Persists raw_records + the derived module row, no
     AI call, no coin debit. Always available.
   - **"Get AI Feedback" = costs coins** (Quick 4 / Deep 6), shown ON the CTA.
   - **UI rule (hard):** never let a user think journaling costs coins. The free
     Save action and the priced AI action are visually distinct; the coin cost
     appears only on the AI CTA.
   - **Implementation (decide at build):** cleanest is AI-as-an-action-on-a-
     saved-entry (also unlocks "get feedback later" / re-run a saved entry),
     vs. keeping two submit modes (save-only / save+AI) on the existing runner.
     `run-module.ts` splits accordingly; `CoachModuleConfig` loses
     `subscriptionGate`/`freeUsageField`.
5. **Wire the coin reserve into the AI path:** at the AI step, derive cost from
   `input.tier`, reserve via `spendCoins(userId, cost, reason,
   ref_key=idempotencyKey)`; on in-request failure before output commits, issue
   the compensating `refund` (per Decision 2). `'insufficient'` → structured
   `{ error: 'insufficient_coins', needed, balance }` (403). Admins bypass.
6. **Insufficient-coins UI:** the AI-feedback action's 403 handler stops doing
   `router.push('/paywall')` and instead shows an inline "You need N coins"
   panel with a Get-Coins CTA — the saved entry is already persisted (free Save),
   so nothing is lost.
7. **Retire page gates:** open manual flows + History + Threads + Insights-view
   + Tools to any signed-in user. Convert `require-access` helpers to auth-only
   (or delete the redirects). Keep `user_subscriptions` dormant.

### B2 — Real payments (Stripe one-time)
1. `POST /api/payments/checkout` — auth + origin + rate limit; maps pack →
   Stripe Price; creates a Checkout Session **mode: 'payment'** (NOT
   'subscription'); returns the redirect URL.
2. `POST /api/payments/webhook` — raw-body Stripe **signature verify** (the
   signature IS the auth — no user auth/CSRF/paywall gate, per webhook pattern);
   handle `checkout.session.completed`; **idempotent grant** keyed on the Stripe
   event id (`ref_key`), so a replayed webhook never double-credits. This is the
   ONLY path that grants purchased coins.
3. `/coins` page (replaces `/paywall`): 4 packs, "Buy" → checkout redirect; coin
   balance shown in the top bar / menu.
4. Remove `createSubscription` + the subscribe mock route.

### B3 — Weekly Insights debit (small, separable)
- Charge 20 coins in front of `generateReflection`, **only on a real generation
  (cache miss)** — the 7-day idempotency short-circuit stays the primary cost
  gate; the debit's `ref_key` = the week-bucket id so re-opening Insights inside
  the week never recharges. Swap `requirePaidAccessApi` for the coin debit.

### B4 — Monthly Report (NET-NEW feature — its own slice)
- Nothing exists yet. Likely an Opus aggregate over ~a month of entries, same
  shape as the weekly reflection (own table or reuse pattern, own prompt, own
  page, own version guard, 80-coin debit keyed to the month bucket). **Recommend
  building this as its own slice AFTER B1–B3 prove the wallet** — bundling a
  brand-new AI feature into the payments slice doubles the risk surface.

## Decisions — RESOLVED (founder, 2026-05-30)
1. **Payment provider = Stripe (web).** B2 is Stripe one-time checkout + webhook.
   No IAP. (iOS App Store was already rejected once — see infra memory.)
2. **Charge timing = reserve at start, finalize on success, auto-release on
   app failure.** (Founder override of the earlier charge-at-start call — more
   user-trustworthy; uses the `refund` ledger reason already planned.)

   | Scenario | Coin behavior |
   |---|---|
   | User has insufficient coins | No generation, no charge |
   | Same idempotency key retried | No duplicate charge |
   | AI output successfully saved | Coins are spent (finalized) |
   | App/server/model fails before output saved | Coins refunded / released |
   | User dislikes the output | No refund |
   | User closes browser after gen started but output saved | Coins spent |

   **Mechanism (append-only ledger):** at the reservation point, debit
   (`debit_quick`/`debit_deep`, `ref_key = idempotencyKey`). The whole
   generation is one synchronous request, so "failure before saved output" is
   detectable in-request: if the AI call or the raw/derived write throws before
   the output row commits, issue a compensating `refund` txn (idempotent) so the
   net is zero — the user is never charged for a failure. On success the debit
   stands. "User dislikes output" is post-save → no refund.
   **B1 implementation detail to nail at build (don't overbuild now):** the
   retry-after-refund path. A genuine retry of a *failed+refunded* attempt must
   be allowed to re-reserve, while a *settled* charge is never double-charged.
   Anchor re-charge eligibility to the existing `raw_records` idempotency — if
   the saved output row exists, return it WITHOUT a second charge (already paid);
   if it doesn't (prior attempt failed+refunded), treat as a fresh reservation.
   Exact ledger ref-key shaping decided when coding; the scenarios table above is
   the contract it must satisfy.
3. **Monthly Report = its own slice (B4), AFTER B1–B3.** Not bundled into the
   wallet/payments work.
4. **Admin = bypass all debits** (unlimited), consistent with current admin
   gate bypass. (Default — revisit only if abused.)
5. **Signup grant = at onboarding completion** (profile save), idempotent on
   `ref_key = 'signup_grant'`, one per user. Anti-abuse (email/device/IP)
   DEFERRED — idempotency is enough for B1 (founder Change 3).
6. **Free Save vs paid AI must be explicit in the UI** (founder Change 2) —
   "Save entry" free, "Get AI Feedback" shows the coin cost. Never imply
   journaling is charged. See B1 item 4.

## Status: HOLDING for founder review of this doc before any B1 code.
