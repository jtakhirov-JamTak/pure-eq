# CLAUDE.md

## Project Overview

Pure EQ — a mobile-first emotional intelligence coaching app (PWA).
Helps users handle hard conversations through self-awareness, emotional regulation,
empathic accuracy, and next-move judgment. Three product areas: Coach, Tools, Insights.

Solo founder, non-technical — explain in plain language, wait for approval before changing code.
When Claude makes a mistake, add the lesson to the "Lessons Learned" section below.

## Where things go

Three-way division for anything worth recording. Apply this test before writing.

- **CLAUDE.md** — durable engineering lessons and repo rules. Only things that change how code gets written in this repo going forward. Passes the test: "would I apply this without thinking the next time I write a similar endpoint/page/schema?"
- **Memory files** (`~/.claude/projects/.../memory/`) — decision history, tradeoffs, and deferred ("not now") work. Context I'd want if someone proposes going back to a rejected path. Procedural guidance about how we work (e.g., "don't mix refactors with fix batches") also lives here.
- **Engineering Playbook** (`docs/Engineering_Playbook.txt`) — only lessons reusable beyond Pure EQ. Promotion happens when a second app re-uses a rule, not speculatively.

Not this: dumping everything into CLAUDE.md. Long CLAUDE.md means signal gets buried and future sessions can't tell a universal rule from a one-time tradeoff.

## Business Context

- Revenue model: 3-day free period (anchored to onboarding completion) with 1 free Prepare + 1 free Review, then $8.99/month or $69.99/year (cancel anytime)
- Onboarding produces a Communication Profile (9-question quiz); free-period anchor starts when profile is saved
- Product doc: docs/Pure_EQ_Final.txt (source of truth for all product decisions)
- Engineering playbook: docs/Engineering_Playbook.txt (reusable security/architecture patterns)

## Commands

| Task              | Command                                             |
|-------------------|-----------------------------------------------------|
| Dev server        | `npm run dev`                                       |
| Build             | `npm run build`                                     |
| Type check        | `npx tsc --noEmit`                                  |
| Lint              | `npm run lint`                                      |
| Tests (unit)      | `npm test`                                          |
| Tests (E2E)       | `ALLOW_E2E_AGAINST_REMOTE=1 npm run test:e2e`       |

Environment: Requires `.env.local` with Supabase and Anthropic keys.
E2E requires the `ALLOW_E2E_AGAINST_REMOTE=1` flag until a local/test Supabase project is set up — guards against accidentally creating users in live auth.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes (server-side), Supabase Edge Functions if needed
- **DB:** Supabase (PostgreSQL + Row-Level Security)
- **Auth:** Supabase Auth (email/password, magic link, social login ready)
- **AI Coach:** Anthropic Claude API (structured JSON outputs, banned-phrase filtering)
- **Voice:** OpenAI Whisper API (speech-to-text for all free text fields)
- **Validation:** Zod on every endpoint and AI output

## Directory Structure

```
src/
  app/
    layout.tsx                        # Root layout, metadata, PWA manifest
    page.tsx                          # Landing page
    not-found.tsx                     # Branded 404 page
    (auth)/login/page.tsx             # Login
    (auth)/signup/page.tsx            # Signup
    onboarding/page.tsx               # 9-question Communication Profile quiz + routing hub
    (app)/layout.tsx                  # Authenticated app shell gate (server component)
    (app)/app-shell.tsx               # Client shell: top bar, bottom tabs, menu
    (app)/coach/page.tsx              # Coach tab home
    (app)/coach/prepare/page.tsx      # Prepare flow (multi-step + AI coaching)
    (app)/coach/review/page.tsx       # Review flow (multi-step + AI reflection)
    (app)/tools/page.tsx              # Tools tab hub (card links)
    (app)/tools/overwhelmed/page.tsx  # I'm Overwhelmed (guided reset + timers)
    (app)/tools/triggered/page.tsx    # I'm Triggered (structured trigger log)
    (app)/insights/page.tsx           # Insights tab (profile + blind spot + empty states)
    (app)/history/page.tsx            # History page (per-module counts + latest entries + delete)
    (app)/history/history-list.tsx    # Client: select + load more + delete confirm
    (app)/history/actions.ts          # Server action: softDeleteEntries
    admin/layout.tsx                  # Admin gate (404 for non-admins)
    admin/page.tsx                    # Admin stats dashboard
    admin/actions.ts                  # Server action: toggleAccess
    admin/users/page.tsx              # User list with grant/revoke
    admin/users/[id]/page.tsx         # User detail (metadata only, no content)
    paywall/page.tsx                  # Paywall gate (server component)
    paywall/paywall-content.tsx       # Pricing display + Start Trial
    dev/whoami/page.tsx               # Dev smoke test (prod-gated)
    api/onboarding/submit/route.ts    # Quiz submission + profile scoring
    api/coach/prepare/route.ts        # Prepare: AI coaching + pattern extraction
    api/coach/review/route.ts         # Review: AI reflection + observation write
    api/tools/overwhelmed/route.ts    # Overwhelmed entry save
    api/tools/triggered/route.ts      # Trigger log entry save
    api/persons/route.ts              # GET (search) + POST (create) persons
    api/history/route.ts              # GET (paginated list) for Load More in /history
    api/subscribe/route.ts            # Mock subscribe (trial activation)
    api/transcribe/route.ts           # Whisper speech-to-text
    api/auth/callback/route.ts        # PKCE code exchange (email confirmation)
    api/admin/backfill-observations/route.ts  # One-time observation backfill
  lib/
    supabase/client.ts                # Browser Supabase client
    supabase/server.ts                # Server Supabase client (createClient)
    supabase/service.ts               # Service role client (admin + subscription writes + E2E, bypasses RLS)
    ai/prompts.ts                     # AI prompt templates (version-controlled)
    ai/schemas.ts                     # AI output Zod schemas + banned-phrase filter
    admin.ts                          # isAdmin() + checkAdmin()
    check-origin.ts                   # CSRF origin check (shared across routes)
    insights.ts                       # Observation tag descriptions, thresholds, blind spot logic
    onboarding.ts                     # Quiz questions, scoring, profile descriptions
    rate-limit.ts                     # In-memory per-key rate limiter (v0)
    subscription.ts                   # checkSubscription, markFreePrepareUsed, createTrial
    validation.ts                     # All request Zod schemas
    verify-ownership.ts               # Person ownership verification
    utils.ts                          # cn() helper, shared utilities
  components/
    countdown-timer.tsx               # Wall-clock timer with audio ping (iOS-safe)
    person-picker.tsx                 # Type-ahead person search + voice input
    voice-input.tsx                   # Voice + text dual input component
  types/
    database.ts                       # Supabase generated types (npm run db:types)
    index.ts                          # Shared app types + observation taxonomy
docs/
  Pure_EQ_Final.txt                   # Product spec (source of truth)
  Engineering_Playbook.txt            # Security and architecture patterns
public/
  manifest.json                       # PWA manifest
  icon-192.svg, icon-512.svg          # Placeholder PWA icons
e2e/
  helpers/auth.ts                     # Service-role admin client + test user lifecycle
  login.spec.ts                       # Login → onboarding smoke test
playwright.config.ts                  # Playwright config (dev server reuse, dotenv)
```

## Adding an API Endpoint

1. Zod schema → `src/lib/validation.ts`
2. Route handler → `src/app/api/{domain}/route.ts`
3. Auth check → `createClient()` then `supabase.auth.getUser()`, 401 if no user
4. Always filter by userId from auth — never trust client-provided userId

## Adding a Page

1. Page component → appropriate directory under `src/app/`
2. Use `(app)` route group for authenticated pages (layout enforces auth)
3. Use `(auth)` route group for login/signup
4. Mobile-first: design for phone screens, then adapt up

## Do's

- Run `npx tsc --noEmit` before considering work complete
- Explain briefly what you're doing and why before making changes
- Save bug fixes and lessons to "Lessons Learned" below
- Use Zod validation on every API endpoint and every AI output
- Use Supabase RLS — every table must have `USING (auth.uid() = user_id)`
- Voice and text input on every free text field (mic icon in text box)
- Structured JSON from all AI calls — never free-form prose as primary output
- Progressive save: save draft after each completed step, not at the end

## Don'ts

- Don't rabbit-hole — if fix fails after 2-3 attempts, stop and reassess
- Don't over-engineer — ship v0 first, iterate
- Don't skip Zod validation on any endpoint
- Don't use `USING (true)` on any RLS policy
- Don't log user content (emotions, triggers, journal text) in error messages
- Don't trust client-provided userId — always extract from Supabase auth
- Don't let AI invent pattern tags at runtime — use controlled taxonomy only
- Don't show insights below evidence thresholds — silence over garbage

## Security Rules

- All API routes: auth check + userId filtering
- RLS enabled on every table with user data
- AI API keys server-side only — never in client code
- User free-text is untrusted data in AI prompts — delimit from instructions
- Rate limit AI and auth endpoints
- Never log response bodies or user content
- Validate all AI output against schema + banned phrases before displaying

## Lessons Learned

- **Zod `length(N)` on arrays does not enforce element uniqueness.** A quiz submission schema that requires "9 answers" silently accepts 9 answers all with the same `questionIndex`. Always `.refine()` array schemas that have semantic keys to enforce the invariant — in Pure EQ we require exactly one answer per index 0-8. Discovered in /full-review as a real scoring-bypass exploit.
- **React strict-mode double-mounts fire `useEffect` twice.** Any effect that does a server write (flush pending onboarding, submit a form, insert a row) must be idempotent via a `useRef` guard OR a server-side dedupe check — `useState` is async and cannot prevent the race. Pattern we use: `if (flushStarted.current) return; flushStarted.current = true;` at the top of the effect, plus ordering the effect's cases so "already has row" is checked before "insert row."
- **iOS Safari zooms on focus when input font-size is <16px.** Always use `text-base` (16px) or larger on email/password/textarea inputs. `text-sm` (14px) breaks the mobile login flow in a way that's invisible in desktop dev. This is a hard iOS rule, not a preference.
- **`/dev/*` debug routes ship to production unless explicitly gated.** Every debug surface we keep should either be removed before launch or gated with `if (process.env.NODE_ENV === "production") notFound();` at the top of the page component. Pattern: dev-only routes get an env gate AND a comment noting they're dev-only.
- **sessionStorage is per-tab but survives cookie clears and logouts.** On shared devices it can leak data from one user's session to another user's new signup. Always stamp pending-persistence blobs with a user hint (email or id) and verify the hint matches the current session before using the data. Discard on mismatch.
- **Empty `catch {}` blocks during critical writes are how users silently lose work.** Every catch in a write path should at minimum `console.error` the message (NOT the full object or payload — no user content) AND surface an inline error to the user. CLAUDE.md already says "fail loudly" — this is the enforcement.
- **Two sequential inserts with no transaction = orphan risk on second failure.** Supabase JS doesn't support client-side transactions without a Postgres RPC function. For v0, the acceptable pattern is: insert source-of-truth row → try derived row → on derived failure, delete the source row we just wrote. An RPC is cleaner but not required at this scale.
- **`scoreProfile`-style fall-through defaults on empty data hide bugs.** A scoring function that runs on all-null input and returns the alphabetically-first enum value (because `Object.entries` ordering is stable) will silently produce "valid" profiles from garbage input. Always `throw` when there's genuinely nothing to score, and let the route map that to a 400. Never paper over empty input with a default.
- **Server re-scoring from raw inputs is non-negotiable.** Client may compute a result for display, but the database row must always be derived server-side from the raw answers the server actually received. This prevents tampering AND keeps the source-of-truth invariant clean for re-derivation.
- **Async callbacks close over stale props — use refs.** A `sendBlob` callback registered inside `recorder.onstop` captures whatever `value` the component had when recording started. If the parent re-renders during the wait (user types while recording, for example), using the captured `value` clobbers the new state when the transcript arrives. Fix: `const valueRef = useRef(value); valueRef.current = value;` and read `valueRef.current` inside the async callback. Same pattern for `onChangeRef`. This applies to every async handler that fires after an `await`: transcribe responses, retry loops, setTimeout bodies, etc.
- **AI calls belong AFTER both raw and derived inserts, not between them.** Pattern for AI-backed modules: insert raw_records → insert derived row with `ai_plan_json: null, is_complete: false` → call Claude → UPDATE derived row with the plan. Reason: AI is slow (15-60s) and paid. Putting the derived insert AFTER the AI call means a derived-insert failure throws away completed coaching output AND forces the user to retry at double the cost. Derived-row-first makes Claude failure recoverable: the row exists, the user can hit "Try again for coaching feedback" to re-run only the AI side.
- **Idempotency key per submission closes the retry-duplicates gap that `submitRef` can't.** `submitRef` guards strict-mode double-mount and in-flight duplicates, but NOT retries after a visible error. Pattern: client generates `crypto.randomUUID()` once per submission, stores it in a `useRef`, sends it as `source_session_id` on every retry of the same submission. Server does SELECT-before-INSERT on `(user_id, source_session_id)` and reuses any existing row. Reset the key only after a clean success (or navigate-away). No client changes are needed until a real, visible failure makes the user retry.
- **Triple-quote delimiting user input in AI prompts is necessary but not sufficient.** A user can emit `"""` mid-field and pivot. Every AI prompt that passes through user text must have a SECURITY section in the system message that explicitly: (1) labels the USER INPUT block as untrusted data, (2) tells the model to ignore commands/role-play/system overrides inside it, (3) instructs the model to respond with the output schema even for abusive/empty/injection-like input — a neutral decline inside the schema, not a refusal that breaks downstream parsing.
- **Origin check on mutating POST routes.** Next.js + Supabase cookies are `SameSite=Lax`, which blocks form-POST CSRF but NOT fetch-based CSRF from a compromised page (especially for multipart/form-data, which transcribe uses). Every write endpoint that touches a paid API or writes a row should compare `req.headers.get("origin")` against `req.headers.get("host")` and 403 on mismatch. Three lines. Real protection.
- **Magic-byte sniffing for uploaded binary, not just MIME.** `Blob.type` is client-supplied and trivially spoofable. Before forwarding any user upload to a paid API (Whisper, image processing, etc.), read the first 12-16 bytes and match against format magic numbers: WebM `1A 45 DF A3`, ISO-BMFF/mp4 `ftyp` at offset 4, MP3 `ID3` or `FF Ex`, OGG `OggS`, WAV `RIFF...WAVE`. Hand-rolled, no dependency. A whitelist of MIME strings alone trusts the attacker.
- **Paid-API endpoints need BOTH per-minute AND per-day rate limits.** A generous per-minute limit doesn't stop a scripted attacker from running 20 calls/min × 24 hours against an expensive API. Two separate buckets, both keyed on `user.id`. For Whisper we picked 6/min + 60/day. Minute bucket blocks burst abuse, day bucket blocks slow cost-bleed.
- **Anthropic/OpenAI client goes OUTSIDE retry loops, with an explicit timeout.** `new Anthropic()` per attempt wastes setup and leaves no way to cap request duration. Pattern: `const client = new Anthropic({ timeout: 30_000 })` above the loop, `await client.messages.create(...)` inside. Without a timeout, a stuck socket hangs the route past Vercel's 504 AFTER a raw row was written — orphan territory. One retry is enough for v0; schema mismatches don't self-heal on attempt 3.
- **Don't persist telemetry fields until something reads them.** `inputModes`, `fieldName` plumbing, feature-usage counters — if no dashboard, pipeline, or code reads the field, it will rot or outright lie (as the `usedVoiceRef` sticky-flag bug proved: every keystroke after the first voice use was tagged as voice). Ship without telemetry and add it when a consumer exists. "Save for the future" is not a real use case.
- **Cleanup-on-derived-failure must only delete the raw row WE just wrote.** The raw→derived→cleanup pattern has a subtle bug: if the raw row was reused from a prior idempotent attempt, cleaning it up on a later derived failure destroys a row the user already owns and a retry was about to rescue. Always gate the delete behind `if (!existingRaw)`. Applied to both `src/app/api/coach/prepare/route.ts` and `src/app/api/coach/review/route.ts`.
- **If a form field exists, the AI prompt must consume it.** Discovered in the review module: `unresolvedAndNext` was collected by the form, stored in both raw and derived rows, but never passed to `buildReviewPrompt` — so every reflection was blind to half the user's intent. Fields that exist only for analytics/tracking shouldn't be in the AI-coaching flow at all. Either wire them into the prompt or drop them from the form.
- **Voice + text on every free-text field — including "one-sentence" fields.** Tempting to use `<input type="text">` for short fields and skip VoiceInput. The rule is absolute: every free-text surface gets a mic. Use `VoiceInput` with smaller `rows` (2-3) instead of falling back to plain `<input>`. Surfaced when the review module's `unresolvedAndNext` shipped as a single-line input and failed the mobile/voice audit.
- **`null` vs `""` for optional fields must be consistent across raw and derived layers.** An optional field produced `""` in `payload_json.fields.validatedAssumptions` but `null` in `review_entries.validated_assumptions` — the two layers disagreed on "not provided," which breaks re-derivation and makes `is null` queries unreliable. Pick `null` (correct semantic) and apply at every persistence layer for that field.
- **Error-path UX must offer a next action, not a dead-end.** When a write succeeds but AI fails, "Entry saved → Done → back to /coach" is a UX dead-end — the user came for coaching and leaves empty-handed. Always offer at least one actionable retry button ("Try again for coaching feedback") on any consolation-prize screen. Paired with an idempotency key, retry is safe — no duplicate rows. Don't write promises into the UI ("this contributes to your insights") that the product doesn't actually keep yet.
- **Silent default on missing foreign state is the same bug as `scoreProfile`'s fall-through, in a different file.** `userProfile = profileRow?.primary_profile ?? "reflective"` silently personalizes coaching for a user who has no profile. If that's an invariant violation (the routing hub should have prevented it), fail loudly: return 409 with "complete onboarding first" and trust the hub. Same for unknown enum values after a CHECK constraint should have caught them — log and return 500, don't silently coerce. "Shouldn't happen" comments are not a substitute for throwing.
- **`setInterval`-based timers drift on backgrounded mobile tabs.** iOS Safari and Android Chrome throttle or pause `setInterval` when the tab is backgrounded. A 61-second breathing timer can take 10+ minutes if the user switches apps. Fix: anchor to wall-clock time with `Date.now()` at start, compute remaining as `max(0, duration - floor((now - startedAt) / 1000))` each tick. When the tab re-foregrounds, the timer immediately shows the correct time.
- **"Done" skip buttons on timers must clear the interval to prevent double-fire.** If a countdown timer has both auto-complete (interval reaches 0) and manual skip (Done button), tapping Done fires `onComplete` while the interval is still running. The interval's next tick can fire `onComplete` again, causing double step-advance. Fix: store interval ID in a ref, clear it in the skip handler, and use a `completedRef` boolean guard so the callback only fires once regardless of source.
- **State set via `useState` is async — don't read it in the same handler that sets it.** `setAfterFeeling(feeling); handleSubmit()` — the submit reads `afterFeeling` from state, which is still `null` because React batches the update. This is the same class of bug as stale closures, just in a synchronous call chain. Fix: pass the value as a function parameter instead of reading from state. The triggered page got this right; the overwhelmed page didn't.
- **Zod `z.number()` accepts floats — add `.int()` for integer-only fields.** `z.number().min(1).max(5)` passes `3.7`, which then fails or truncates at the DB's `smallint` column. Always chain `.int()` for ratings, intensity scales, and any field backed by an integer column.
- **Web Audio API on iOS Safari requires AudioContext creation inside a user gesture handler.** Creating an `AudioContext` inside `setInterval` or `setTimeout` will be silently blocked. Fix: create the AudioContext as a module-level singleton and call `resume()` from the earliest user tap (e.g., intro "Start" button). Export an `unlockAudio()` function for parent components to call on button clicks before any timer mounts.
- **Extract shared utilities at 4+ duplications, not 3.** The project rule was "three instances = pattern." In practice, `checkOrigin` reached 5 copies before extraction. When the same function appears in 4+ files with identical code, extract it immediately in the same batch — it's no longer premature. Shared utility lives at `src/lib/check-origin.ts`.
- **Non-AI write endpoints still need per-day rate limits.** Even without a paid API call, each request writes 2 DB rows. A scripted attacker running 10/min for 24h = 14,400 rows/user/day. Add a generous day bucket (100/day for journaling tools) to prevent row exhaustion. The cost isn't API spend, it's storage and query performance.
- **`router.push()` after login/signup is a race with session cookies.** `router.push("/onboarding")` fires client-side navigation before the middleware can process the new auth session. The target page's `getUser()` call may hang or return null. Fix: use `window.location.href` for post-auth redirects so the browser does a full navigation and the middleware sets cookies first. Only applies to the login→authed transition, not within-app navigation where the session is already established.
- **Zod `.min(1)` on strings does NOT reject whitespace-only input.** `z.string().min(1)` passes `"   "` (3 spaces). For name fields and any user-facing text, always chain `.trim()` before `.min(1)` so whitespace-only strings fail validation. Without this, invisible person records and empty-looking entries get created.
- **Auto-create person records need dedup by `(user_id, display_name, relationship_domain)`.** Without a SELECT-before-INSERT check, typing "Mom" across two separate Prepare sessions creates two duplicate person rows. The idempotency key only protects raw_records within a single submission, not cross-submission person creation. Pattern: SELECT for matching active person first, reuse if found, INSERT only if not.
- **`mousedown` for outside-click dismiss doesn't work reliably on iOS Safari.** Use `pointerdown` instead — it covers both mouse and touch events uniformly. Same applies to any "click outside to close" pattern on dropdowns, modals, or popovers.
- **LIKE/ILIKE metacharacters `%` and `_` must be escaped in user-supplied search queries.** A user sending `q=%` to a `.ilike("column", `%${q}%`)` call matches every row. Escape with `q.replace(/%/g, "\\%").replace(/_/g, "\\_")` before interpolation. Supabase parameterizes the value (no SQL injection), but the LIKE wildcards inside the pattern are still active.
- **Keyboard-open dropdown positioning on mobile requires a scroll-into-view nudge.** When a dropdown renders below an input and the mobile keyboard is open, the dropdown can be entirely behind the keyboard. Add `scrollIntoView({ behavior: "smooth", block: "nearest" })` on the dropdown element when it opens, plus a bottom spacer div to ensure there's room to scroll.
- **Threshold gates must match what's actually instrumented.** The product doc requires 3+ event types for emerging insights, but v0.5 only extracts observations from Review. Requiring 3 event types blocks the exact users with the most pattern data. When only one module produces the gated signal, lower the threshold and comment why — raise it when more extractors ship. The event diversity requirement exists for a reason: a blind spot surfaced from 6 Reviews alone could be an artifact of how Review's AI assigns tags, not a real behavioral pattern. Cross-module confirmation (Review + Trigger + Prepare all pointing to the same tag) is a stronger signal. Restore `minEventTypes: 3` as soon as a second extractor ships.
- **Unbounded Supabase selects on server-rendered pages degrade silently.** A `.select()` with no `.limit()` works fine at 10 rows but crawls at 1000. Every server-component query that returns user-scoped rows needs a `.limit()` safety cap (1000 for raw_records, 500 for observations). Flag with a comment for the RPC upgrade path.
- **`text-zinc-400` at `text-xs` fails WCAG AA contrast (3.5:1).** Use `text-zinc-500` minimum for all body/label text, `text-zinc-600` for `text-xs` labels where contrast matters. zinc-400 is only acceptable for decorative/non-essential text.
- **Admin-only endpoints still need origin check + rate limit.** An admin session is still a browser session — CSRF applies. The "it's admin-only" instinct skips checkOrigin and rateLimit, but a compromised page can trigger the endpoint if the admin is logged in. Same 3-line pattern as every other POST route.
- **Open redirect via `next` query param on auth callback.** Any redirect target from a query param must be validated: starts with `/` and does NOT start with `//`. Without this, `?next=//evil.com` redirects users off-site after authentication. Also applies to any server-returned redirect value used with `router.replace()`.
- **Auth callback needs rate limiting even though Supabase handles code exchange.** The callback route calls `exchangeCodeForSession(code)` — without a rate limit, an attacker can brute-force auth codes. Rate limit by IP (not user, since user isn't authenticated yet).
- **Menu links to unbuilt pages are live 404s.** Every nav link must point to an existing page. If a feature isn't built yet, either remove the link or create a placeholder page. Users seeing a 404 inside the app destroys trust. Caught with `/account` and `/data` links in the app shell.
- **PWA manifest is required for "Add to Home Screen" on mobile.** Without `manifest.json` + icons, the app can't be installed as a PWA. Minimum: `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, `icons` (192 + 512). Link it from root layout metadata.
- **Select-step auto-advance on the last step causes stale-state submit.** When a select button both sets state and triggers submit, `handleSubmit` reads from the closure's stale `data`. The `setTimeout(0)` trick does NOT guarantee React has flushed. Fix: pass an `overrideData` parameter to `handleSubmit` with the final value merged in. This is the same class of bug as stale closures in async callbacks — just in a synchronous call chain.
- **Positive counter-patterns need the same minimum evidence count as negative patterns.** Showing "you also validate their experience" from a single observation is noise, not insight. Both positive and negative patterns should require `emergingTagCount` (2+) occurrences before being shown. Applies to "How You Tend to Land" counter-patterns and per-person positive patterns.
- **Don't gate an existing insight behind a newly-shipped module.** Product doc §11.3 requires 1+ Repair entry for person patterns. But if Repair just shipped and has zero adoption, this blocks every user from seeing person-specific insights even with 20+ Review entries for the same person. Relax the threshold for v0 and comment the intended value — raise it when the gating module has real adoption.
- **Freshness labels must reflect actual computation behavior.** "Next update at 12" implies batch processing, but v0 recomputes on every page load. Dishonest labels erode user trust. Use accurate text ("Based on N entries across M days") until real batch regeneration ships.
- **Hub pages need `pb-28` for bottom tab bar clearance.** Any page inside `(app)/` renders with a bottom tab bar. Without adequate bottom padding, the last card is hidden behind the tab bar on phones. All hub/list pages need at minimum `pb-28`.
- **`fetch()` does NOT throw on 4xx/5xx — always check `res.ok`.** `fetch` only throws on network failures. A 401, 429, or 500 response is a successful fetch. Every client-side `fetch` that writes data must check `if (!res.ok) throw` before marking success. Without this, the UI shows "saved" when the server rejected the request. Caught in outcome tracking where `submitOutcome` was showing "Outcome saved" on every HTTP error.
- **PATCH/update routes need the same hardening as POST routes.** Outcome PATCH routes initially shipped without per-day rate limits, idempotency checks, or overwrite guards. Every write route — including updates — needs: origin check, auth, rate limit (minute + day), idempotency on raw_records insert, and a guard against re-submission where applicable (check if column IS NULL before UPDATE).
- **Heuristic extractors need an intensity gate before keyword matching.** A user with `beforeRating: 2` (mild overwhelm) who mentions "deadline" shouldn't get tagged `recurring_trigger_pressure`. Add a minimum intensity threshold before running keyword checks. Low-intensity entries are noise, not pattern.
- **Keyword checks should run before intensity heuristics in extractors.** A user who writes "I was criticized" at high intensity should get `recurring_trigger_criticism` (specific), not `escalated_after_trigger` (generic). Keywords are more informative than intensity alone.
- **External service wrappers must try/catch and fall back, not crash the route.** Upstash rate limiter with valid env vars but wrong credentials (rotated token, typo) caused unhandled rejections that 500'd every API route. The fallback to in-memory only kicked in when env vars were missing, not when the service was broken. Pattern: try the external call, catch, fall back to the local equivalent, log the failure.
- **`z.ZodType<any>` on a shared config interface defeats TypeScript's entire value proposition.** When `requestSchema` was typed `any`, `parsed.data` was `any`, and every field access on `input` compiled silently even if misspelled. Three reviewers independently flagged it. Always type shared schema fields with the intersection of common fields the consumer actually accesses: `z.ZodType<TInput & { idempotencyKey: string; personId?: string | null; ... }>`.
- **Read-only lookups go before the idempotency guard; writes go inside it.** Thread auto-link (finding an existing thread) is a read-only query and must run on every attempt including retries, so it goes before `if (!existingRaw)`. Thread auto-create (inserting a new thread) is a write and must stay inside the guard. The original lesson "side effects inside idempotency guard" is correct for writes, but moving read-only resolution inside the guard causes retries to get null thread_ids.
- **Server actions need rate limiting too.** Next.js server actions have automatic CSRF protection (bound action tokens), but they're callable via POST with no throttle by default. Every server action that writes to the DB needs `rateLimit()` at the top, same as API routes. Three reviewers independently flagged `updateThreadStatus` for missing rate limit.
- **Picker state must reset when its parent selection changes.** When a ThreadPicker is driven by personId, changing the person must reset the threadId to null. Otherwise the parent keeps a stale threadId from the previous person, and submit sends the wrong thread. Pattern: `onPersonSelect={(id) => { setPersonId(id); setThreadId(null); }}`.
- **`resolved_at` must be cleared when un-resolving.** Setting `resolved_at` on "resolved"/"ended" but not clearing it on revert to "open" leaves a stale timestamp. Always explicitly set `resolved_at: null` in the non-terminal branch.
- **`process.env.X!` with a misspelled name silently yields `undefined`.** `SECRET_KEY` vs `SUPABASE_SECRET_KEY` drifted between `.env.local` and `src/lib/supabase/service.ts`, so `createServiceClient()` had been passing `undefined` as the service key for weeks. TypeScript's non-null assertion doesn't validate the value — it just silences the "possibly undefined" warning. Every env read in a server-only module must either check the value explicitly and throw a named error, or come from a central config object that validates at startup. Never chain `!` on `process.env.X` and call it done.
- **Supabase built-in SMTP rate-limits at ~3 emails/hour — blocks signup UI E2E tests.** Every `auth.signUp()` with email confirmation ON sends a confirmation email, which burns SMTP quota. Running more than 3 signup-UI tests in an hour fails with `email rate limit exceeded`. Workaround for E2E: create users via `admin.auth.admin.createUser({ email_confirm: true })` which skips email entirely. Signup-UI E2E testing has to wait for custom SMTP (SendGrid/Resend/Postmark).
- **Playwright tests against a remote Supabase project need an explicit opt-in flag.** The dev and prod database are the same project in v0. Without a guard, a stray env flip or CI misconfig creates+deletes real users in live auth. Pattern: `createAdminClient()` throws unless `ALLOW_E2E_AGAINST_REMOTE=1` is set when the URL matches `supabase.co`. Three lines, real safety.
- **Playwright `reuseExistingServer: true` can lie in local runs.** A green run against a stale dev server (HMR failed, branch switched) is still "PASS" — the test is validating yesterday's code. Safe for CI (webServer is skipped), risky locally. Either stop the dev server before E2E runs, or flip `reuseExistingServer` to false and accept the boot cost.
- **FK cascades from `auth.users` make `admin.auth.admin.deleteUser()` data-safe.** Every Pure EQ table with `user_id uuid references auth.users(id)` uses `on delete cascade`, so deleting a test user via the admin API cleans up `user_profiles`, `raw_records`, `user_subscriptions`, `pattern_observations`, `derived_insights`, `persons`, `threads`, and all module-specific entry tables in one shot. Verified across migrations 0001–0013. Test cleanup helpers can rely on this.
- **Fire-and-forget AFTER `revalidatePath` lets stale cache leak to the next render.** Pattern in the history-delete flow: `regenerateInsights(...).catch(...)` followed by `revalidatePath("/insights")` meant the client navigated to `/insights` and read cached `derived_insights` rows that still reflected the just-deleted observations. The fire-and-forget finished 1-3s later, too late for the user's first view. Rule: if a derived/cached computation must match a mutation, `await` it before the revalidate. Fire-and-forget is only safe when the consumer tolerates eventual consistency.
- **`Promise.all` over a list of DB writes hides per-row failures.** Each result must be inspected for `.error`. Otherwise an UPDATE on one of the derived tables can silently fail while the function reports `success: true`, leaving raw_records marked deleted but a derived row still visible to module-specific queries. Same class of bug as empty `catch {}` on critical writes — just parallelized. Pattern: collect the results, `filter(r => r?.error)`, and fail the whole action if any failed.
- **Origin check applies to enumeration GETs too, not just mutating endpoints.** A GET that lists user-scoped data (ids, dates, counts) leaks sensitive metadata if reached from a foreign origin with the user's cookie. SameSite=Lax blocks form-POST CSRF but not fetch-based CSRF from a compromised page. Rule: every endpoint that enumerates user-owned rows checks `origin` against `host`, same three-line `checkOrigin()` as writes.
- **16px checkbox alone is a dead tap target on mobile.** Native `<input type="checkbox">` is ~16px — well below the iOS 44pt / Android 48dp guideline. Text next to it doesn't toggle selection unless the row is wrapped in `<label>`. Pattern: whole-row `<label>` with `min-h-11` and `cursor-pointer`, checkbox + text as children. Applies to list-selection UIs (history, settings pages, multi-select pickers). Same family as the h-10 range-slider lesson.
- **Per-day rate limits apply to read endpoints that enumerate user data.** A compromised session with a generous per-minute limit (say 30/min) scrapes the user's entire history at 43,200 requests/day unseen. Not a DoS vector — a sensitive-data exfiltration vector. Pair every enumeration endpoint with a day bucket (1000/day per user is generous and still caps the bleed).
- **Step-based forms must key any mic/camera/sensor-holding component by the current step.** React reuses component instances at the same tree position. A `<VoiceInput>`, `<PersonPicker>`, or any other component holding hardware handles (mic, camera, geolocation watch), long-lived subscriptions (websockets, event sources), or mutable long-running state (timers, workers) will NOT unmount when the user navigates between steps that render the same component type at the same position. Streams, recorders, and intervals survive — and their transcripts or callbacks later fire against whatever step is active, polluting the wrong field. Force fresh instances with `key={currentStep.key}` (or equivalent stable per-step identifier). This applies even if the component currently only appears in one step — future refactors that reuse the same component across steps will silently re-introduce the bug.
- **PostgREST's default `db-max-rows` (1000) silently truncates `.limit(N)` for N > 1000.** Setting `.limit(5000)` without raising `db-max-rows` in the Supabase dashboard returns at most 1000 rows with no error. Especially dangerous for export/enumeration features where users expect completeness — they'll think their data is gone. Rule: match `.limit()` to the project's actual cap (default 1000) AND surface a truncation notice in the output when the count equals the cap, OR raise `db-max-rows` in the dashboard. "5000 as a defensive ceiling" is a lie if PostgREST silently clips at 1000 first.
- **Middleware + route-level auth gates enforcing the same redirect is one source of truth too many.** If `middleware.ts` already redirects authed users off `/login`+`/signup`, adding `(auth)/layout.tsx` to do "same but smarter with profile awareness" doubles the logic and makes future reviewers hunt in two places. Inventory `middleware.ts` before adding route-level gates. Pick one owner: either middleware handles the base redirect and the page layer adds profile-specific routing OR deletes itself and accepts the double-hop.
- **Hand-rolled row types next to Supabase queries silently drift when columns rename.** `type PrepareRow = { situation_text: string | null; ... }` compiles fine after `ALTER TABLE ... RENAME COLUMN situation_text TO situation` — TypeScript never connects the hand-typed name to the generated `Database` types. For export/formatter/prompt-builder layers, derive `Pick<Database["public"]["Tables"]["X"]["Row"], ...>` so column renames break the build at the call site. Same class as the review-module `unresolved_and_next` lesson.
- **`maybeSingle()` and bare `.select()` do not throw on DB errors — they return `{ data: null, error: ... }`.** An aggregation route that builds a user-visible output from N queries must inspect `.error` on every result, not just `.data`. Otherwise a transient DB outage renders "No entries yet." across every section and the user concludes their data is gone. Rule: for any user-facing enumeration or export route, collect `.error` per result and return 500 if any failed. Read-side cousin of the empty-catch-on-critical-writes lesson.
- **Null-sentinel in cross-account guards defeats the whole check when "null" is the common safe-path case.** `if (pending.userHint && pending.userHint !== currentHint) clearPending();` skips the check when `userHint === null` — exactly the pre-auth case the guard exists for. Two valid fixes: (a) require a non-null hint at stash time (fine when the identity is known); (b) bind the stash to a second recency signal so only fresh signups can claim a null-hint stash (e.g., `user.created_at` within N minutes of `stashedAt`). Pre-auth-stash flows need (b) — established users logging in on the same device fail the window; new signups pass.
- **Schema-shape redundancy, paired-field discipline, and lossy-forward contractions.** Three rules from the Prepare/Review/Repair simplification: (a) If a question already performs the corrective function, don't also surface the answer as a separate field — the reality-check question carries the "what you may be missing" load on its own, so those were redundant. (b) Paired do/don't fields earn their place only when they operate at different levels (a strategy move vs a phrase-level opener); diagnosis-plus-answer pairs are just noise and raise cognitive load without adding anything actionable. (c) Schema contractions are lossy forward: old JSONB rows keep their original fields, new rows don't. Renderers must be field-presence-based — no top-level destructuring of expected fields, no filtering out legacy rows by schema version, no assumption that a new-shape field will be present on every historical row. Any field cut from schema-v(N+1) is recoverable only from rows written at schema-v(N); if the data is ever needed again, it only exists on pre-bump rows.
- **Whitespace on AI output strings, not just user-input strings.** The `z.string().min(1)` lesson for user-authored name fields applies equally to LLM outputs. `z.string().max(N)` accepts `""` and `"   "`, and `!!x` at the render layer is truthy for `" "` — so the model can return a blank string and the UI renders an empty card under a label. Always chain `.trim().min(1)` on every AI output string field. Don't rely on the render layer's `!!` to substitute; the schema is the first line of defense and the render layer is the second.
- **Field-presence renderers must handle the all-empty case, not just missing fields.** "Presence-based rendering" stops empty cards showing individually, but if every field is missing (legacy payload on the new UI, stripped-by-trim output on retry, or a replayed idempotency hit with a stale shape), the user sees a bare `h2` and a Done button with no coaching and no next action — a dead end. Any `.filter(...).map(...)` render of AI output must check `visible.length === 0` and fall through to a saved-but-no-coaching screen with a retry button, not render an empty list.
- **PROMPT_VERSION is traceability theater unless wired to a persisted column.** Bumping a `PROMPT_VERSION` constant in code while the DB's `ai_plan_version` / `ai_reflection_version` / `ai_strategy_version` column stays pinned at `1` means every row still claims to be v1 — there is no queryable way to distinguish old-shape rows from new-shape rows, which is the whole point of the version column. Either bump the `aiVersionValue` integer (cheapest, one line per route config) in the same commit as any output-shape change, or delete the constant. Same rule for `extractorVersion`: if `supporting_evidence_json` changes shape, bump the extractor tag (e.g. `prepare_v1` → `prepare_v2`) so observations are queryable by write-side shape — even if no consumer reads the field today.
- **`Origin` header is absent on same-origin GET navigations — `<a href download>` 403s if you only check `Origin`.** The browser does not attach `Origin` to top-level same-origin GET navigations (the `<a download>` click, form submit, typed URL), only to fetch-based requests and cross-origin navigations. A `checkOrigin()` that returns false when `Origin` is missing will reject every Download button that uses `<a href="/api/..." download>`. Fix is to check `Sec-Fetch-Site` first (modern browsers set it on every request including nav; forbidden-header so JS can't spoof): accept `same-origin` and `none` (direct user action), reject `same-site` + `cross-site`, fall back to the `Origin`/`Host` compare only when `Sec-Fetch-Site` is absent. This is strictly additive to existing POST protection — non-simple fetch POSTs already send both headers. Caught when `/api/export` never returned a 200 from the Download button.
