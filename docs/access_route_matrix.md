# Access Route Matrix

Classifications:
- `always_open_after_auth` — any authed user (includes public pre-auth pages)
- `free_or_paid` — admin, paid, or unpaid-with-free-window / free-use
- `paid_only` — admin or paid; all other unpaid users bounce to `/paywall`
- `admin_only` — admin only

Access is checked in three layers: middleware (unauthed → `/login`), layout (broad paywall gate for the `(app)` subtree), and per-route server logic. The Tools subtree lives outside `(app)` so its own layout can make a local access decision without the broad gate firing.

| Route | Current behavior | Target behavior | Classification | Code change? |
|---|---|---|---|---|
| `/` | public landing | unchanged | always_open_after_auth (public) | no |
| `/login`, `/signup` | public; middleware redirects authed users to `/onboarding` | unchanged | always_open_after_auth (public) | no |
| `/onboarding` | public; server-gated hub | unchanged | always_open_after_auth | no |
| `/paywall` | authed; outside `(app)` to avoid redirect loop | unchanged | always_open_after_auth | no |
| `/coach` (hub) | `(app)` layout lets unpaid within 3-day + free-use through; bounces day 4+ | unchanged | free_or_paid (nav hub; children gate themselves) | no |
| `/coach/prepare` | `(app)` layout permissive inside 3-day; API `subscriptionGate: "free_one"` consumes 1 free use | unchanged | free_or_paid | no |
| `/coach/review` | same pattern as prepare | unchanged | free_or_paid | no |
| `/coach/repair` | client page unconditionally rendered journaling UI; only API gated | server wrapper redirects to `/paywall` when `!hasAccess`; client body moved to `repair-client.tsx` | paid_only | yes |
| `/coach/threads` | `(app)` layout permissive inside 3-day; RLS empty for unpaid | explicit `checkSubscription` redirect in the server page | paid_only | yes |
| `/coach/threads/[threadId]` | same | same | paid_only | yes |
| thread status actions (`updateThreadStatus`) | no subscription check; owner RLS enforces | unchanged (reachable only from gated threads page) | paid_only (reachable only from threads page) | no |
| `/insights` | `(app)` layout permissive inside 3-day; RLS empty for unpaid | explicit `checkSubscription` redirect in the server page | paid_only | yes |
| `/history` | same | explicit `checkSubscription` redirect in the server page | paid_only | yes |
| `/tools` (hub) | `(app)` layout permissive inside 3-day; bounces day 4+; hub page renders buttons unconditionally | moved to `/tools` outside `(app)`; server-component hub renders buttons if admin/paid/within-7d, else locked card | free_or_paid (new 7-day window) | yes |
| `/tools/overwhelmed` | `(app)` layout permissive inside 3-day; API 403 for unpaid | page-level redirect to `/paywall` outside access; API gate updated | free_or_paid (new 7-day window) | yes |
| `/tools/triggered` | same | same | free_or_paid (new 7-day window) | yes |
| `/admin`, `/admin/users`, `/admin/users/[id]` | gated by `checkAdmin` | unchanged | admin_only | no |
| `/api/auth/callback` | PKCE exchange | unchanged | always_open_after_auth | no |
| `/api/onboarding/submit` | authed | unchanged | always_open_after_auth | no |
| `/api/coach/prepare` | `free_one` gate + atomic reservation | unchanged | free_or_paid | no |
| `/api/coach/review` | `free_one` gate + atomic reservation | unchanged | free_or_paid | no |
| `/api/coach/review/outcome` | PATCH existing review row; no sub check (owner-gated by RLS) | unchanged | paid_only (implicit — only reachable after Review) | no |
| `/api/coach/repair` | `required` gate | unchanged | paid_only | no |
| `/api/coach/repair/outcome` | PATCH existing repair row; owner-gated | unchanged | paid_only (implicit) | no |
| `/api/coach/threads` (GET) | authed + rate limit; no sub check | explicit `checkSubscription` 403 | paid_only | yes |
| `/api/tools/overwhelmed` | `if (!hasAccess) 403` | `if (!hasAccess && !toolsWindowActive) 403` | free_or_paid | yes |
| `/api/tools/triggered` | same | same | free_or_paid | yes |
| `/api/history` (GET) | authed + rate limit; no sub check | explicit `checkSubscription` 403 | paid_only | yes |
| `/api/export` (GET) | authed + rate limit; no sub check | explicit `checkSubscription` 403 | paid_only | yes |
| `/api/persons` (GET/POST) | authed + rate limit; no sub check | unchanged | free_or_paid (support surface used during onboarding + Coach) | no |
| `/api/transcribe` (POST) | authed + rate limit | unchanged | always_open_after_auth (used during onboarding + every free-text field) | no |
| `/api/subscribe` (POST) | authed + rate limit | unchanged | always_open_after_auth (must be reachable from `/paywall` for conversion) | no |
| `/api/insights/generate` (POST) | authed + origin + paid-only + 3/week rate limit; 7-day idempotency short-circuit is the primary cost gate | — | paid_only | no (new) |

Notes:
- Every `paid_only` row is now defended by an explicit `checkSubscription` check at the route/page level (not just the `(app)` layout gate). An unpaid user within the 3-day Coach window can no longer reach `/insights`, `/history`, `/coach/repair`, `/coach/threads`, `/coach/threads/[threadId]`, nor their `/api/*` peers — each redirects or 403s directly.
- The `(app)` layout's broad paywall redirect is preserved as a backstop.
- The new Tools carve-out is narrow: only `/tools`, `/tools/overwhelmed`, `/tools/triggered`, and their two POST APIs allow an unpaid user within the 7-day window. Nothing else broadens.
- The Tools 7-day window and the Coach 3-day window share the same anchor: `user_profiles.created_at` (earliest profile row). Constants `COACH_FREE_PERIOD_DAYS = 3` and `TOOLS_FREE_PERIOD_DAYS = 7` live together in `src/lib/subscription.ts`.
