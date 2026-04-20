# CLAUDE.md

## Project Overview

Pure EQ — a mobile-first emotional intelligence coaching app (PWA).
Helps users handle hard conversations through self-awareness, emotional regulation,
empathic accuracy, and next-move judgment. Three product areas: Coach, Tools, Insights.

Solo founder, non-technical — explain in plain language, wait for approval before changing code.
When Claude makes a mistake, add the lesson to the "Lessons Learned" section below — or to `docs/Engineering_Playbook.txt` if it passes the transplant test: would this rule apply to a reasonable web app with different domain, different UI, and different data model? If yes, write it as a generic pattern and mention Pure EQ only as a validating example, never as the pattern's origin.

## Where things go

Three-way division for anything worth recording. Apply this test before writing.

- **CLAUDE.md** — durable Pure-EQ repo rules. Only things that change how code gets written in this repo going forward. Passes the test: "would I apply this without thinking the next time I write a similar endpoint/page/schema?"
- **Memory files** (`~/.claude/projects/.../memory/`) — decision history, tradeoffs, and deferred ("not now") work. Context I'd want if someone proposes going back to a rejected path. Procedural guidance about how we work (e.g., "don't mix refactors with fix batches") also lives here.
- **Engineering Playbook** (`docs/Engineering_Playbook.txt`) — lessons that pass the transplant test: would this rule apply to a reasonable web app with different domain, different UI, and different data model? Mention Pure EQ only as a validating example, never as the pattern's origin. Entries promoted before App #2 exists are marked "pending cross-app validation" at the top of the entry and audited when App #2 first applies them. Universal patterns (validation, auth, rate limit, idempotency, CSRF, raw+derived, stale closures, timers, fetch res.ok, magic-byte sniff, extraction via confidence gate, etc.) live there in §3–§16 — read the playbook FIRST, then the deltas below.

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
- **Observability:** Sentry (with custom PII scrubber — see Sentry section below)

## Directory Structure

Full tree + rationale lives in `docs/Engineering_Playbook.txt` §1. Pure-EQ-specific locations:

- `src/app/(auth)/{login,signup}/page.tsx` — public auth pages
- `src/app/(app)/layout.tsx` — auth gate for every authenticated page
- `src/app/(app)/app-shell.tsx` — top bar + bottom tabs + menu
- `src/app/(app)/coach/{prepare,review}/page.tsx` — core coach flows (multi-step + AI)
- `src/app/(app)/tools/{overwhelmed,triggered}/page.tsx` — tools (guided reset, trigger log)
- `src/app/(app)/insights/page.tsx` — profile + blind-spot insights
- `src/app/(app)/history/{page,history-list,actions}.tsx` — history list + soft delete action
- `src/app/admin/{page,users,users/[id]}/page.tsx` — admin dashboard + user management
- `src/app/onboarding/page.tsx` — 9-question quiz + routing hub
- `src/app/paywall/` — paywall gate + pricing UI
- `src/app/api/coach/{prepare,review}/route.ts` — AI-backed coach endpoints
- `src/app/api/tools/{overwhelmed,triggered}/route.ts` — tool write endpoints
- `src/app/api/{persons,history,subscribe,transcribe,auth/callback}/route.ts`
- `src/lib/{validation,check-origin,rate-limit,subscription,admin,insights,onboarding,verify-ownership,utils}.ts`
- `src/lib/{supabase/{client,server,service},ai/{prompts,schemas},coach/run-module}.ts`
- `src/components/{voice-input,person-picker,countdown-timer}.tsx`
- `src/types/{database,index}.ts` — generated Supabase types + app taxonomy
- `supabase/migrations/` — versioned SQL (0001–0013 at time of writing)
- `e2e/helpers/auth.ts` — service-role test-user lifecycle

## Adding an API Endpoint

1. Zod schema → `src/lib/validation.ts`
2. Route handler → `src/app/api/{domain}/route.ts`
3. Auth check → `createClient()` then `supabase.auth.getUser()`, 401 if no user
4. Always filter by userId from auth — never trust client-provided userId
5. For origin check, rate limit, raw+derived insertion, AI calls, error logging — follow playbook §2–§9 / §16

## Adding a Page

1. Page component → appropriate directory under `src/app/`
2. Use `(app)` route group for authenticated pages (layout enforces auth)
3. Use `(auth)` route group for login/signup
4. Mobile-first: design for phone screens, then adapt up
5. Hub/list pages need `pb-28` or the bottom tab bar eats the last card

## Do's

- Run `npx tsc --noEmit` before considering work complete
- Explain briefly what you're doing and why before making changes
- Save bug fixes and lessons to "Lessons Learned" below (or the Engineering Playbook if a second app re-uses the rule)
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
- Gate `/dev/*` routes with `if (process.env.NODE_ENV === "production") notFound();`

## Lessons Learned

Universal traps (Zod `.min(1)`/`.int()`/length-uniqueness, auth/rate-limit/origin-check/magic-byte patterns, idempotency keys, raw+derived + AI-after-both-inserts, stale-closure refs, wall-clock timers, fetch `res.ok`, external service fallback, `process.env.X!`, etc.) live in `docs/Engineering_Playbook.txt` §3–§16 — don't re-document them here. Entries below are Pure-EQ-specific repo rules or lessons not yet generalized.

### Validation & data shape

- **`null` vs `""` must be consistent across raw and derived layers.** Optional empty fields stored as `""` in `payload_json` but `null` in the typed table break re-derivation and `is null` queries. Pick `null`, apply at every persistence layer.
- **Whitespace on AI output strings, not just user input.** Chain `.trim().min(1)` on every AI output string field. The model can return `" "`; render-layer `!!` is truthy for a space and prints an empty card under a label.
- **If a form field exists, the AI prompt must consume it.** Analytics-only fields don't belong in an AI-coaching flow. Either wire the field into the prompt builder or drop it from the form. Caught when Review's `unresolved_and_next` was collected and stored but never passed to `buildReviewPrompt`.

### AI pipelines & versioning

- **Field-presence renderers must handle the all-empty case.** `.filter(...).map(...)` on AI output with zero surviving fields renders a bare heading + Done button — a dead end. Fall through to a saved-but-no-coaching screen with a retry button.
- **Bump the DB version column every time the AI output shape changes.** `PROMPT_VERSION` in code while `ai_*_version` stays at 1 is traceability theater — old-shape vs new-shape rows can't be distinguished. Bump `aiVersionValue` and the extractor tag (`prepare_v1` → `prepare_v2`) alongside any shape edit, even if no consumer reads the field today.
- **Server re-scores from raw inputs — always.** Client may compute a result for display, but the DB row must be derived server-side from the answers the server actually received.
- **`scoreProfile`-style fall-through defaults hide bugs.** A scoring function that runs on all-null input and returns the alphabetically-first enum silently produces "valid" profiles from garbage. Always throw on empty input and let the route map to 400.
- **Silent default on missing foreign state is the same bug in a different file.** `userProfile ?? "reflective"` personalizes coaching for a user with no profile. If an invariant was meant to be upheld upstream (routing hub), fail loudly (e.g., 409 "complete onboarding first") rather than coerce.
- **AI output `.max()` caps and BREVITY prompt guidance.** All 3 coach modules use `.max(300)` on string outputs. `prompts.ts` BREVITY block states the HARD limit, gives per-field-type target ranges (phrase 80–150, paragraph 200–280), and tells the model how to handle the cap (cut qualifiers, never fall back to category labels). Universal pattern in `docs/Engineering_Playbook.txt` §16.13; current cap value chosen from the 04-20 Review incident (memory: `project_review_max_caps_incident.md`).
- **Untyped `jsonb` reads need a generator_version check + runtime shape guard — never a blind `as unknown as T` cast.** When a computed snapshot is stored in a `jsonb` column and read back on cache hit, the type-system has no enforcement. Legacy rows from before a shape change, hand-edited rows, or partial migrations all render as garbage. Two-layer defense: (1) stamp `generator_version` on the row and skip rows that don't match the current code's version, (2) runtime-check the shape with a narrow `isX(value): value is X` guard. On either failure, fall through to live recompute rather than render a broken card. Same principle as bumping the DB version column on shape change; this is the read-side counterpart.

### Supabase & data access

- **Auto-create person records need `(user_id, display_name, relationship_domain)` dedup.** Idempotency protects raw_records within a submission, not cross-submission person creation. SELECT-before-INSERT for a matching active person; reuse if found, insert only if not.
- **Unbounded `.select()` on server-rendered pages degrades silently.** Works at 10 rows, crawls at 1000. Every user-scoped server-component query needs a `.limit()` cap (1000 for raw_records, 500 for observations). Comment the RPC-upgrade path.
- **PostgREST `db-max-rows` defaults to 1000 and silently truncates `.limit(N>1000)`.** Raise `db-max-rows` in the Supabase dashboard OR surface a truncation notice when count equals the cap. Critical for export/enumeration features where completeness matters.
- **Hand-rolled row types drift when columns rename.** `type PrepareRow = { situation_text: ... }` compiles fine after a column rename because TypeScript never connects the hand-typed name to the generated `Database` types. Derive from `Pick<Database["public"]["Tables"]["X"]["Row"], ...>` in export/formatter/prompt-builder layers so renames break the build at the call site.
- **`maybeSingle()` and bare `.select()` do NOT throw on DB errors.** They return `{ data: null, error: ... }`. Any user-facing aggregation route must inspect `.error` on every query; otherwise a transient DB outage renders "No entries yet." across every section and the user concludes their data is gone.
- **`Promise.all` over DB writes hides per-row failures.** Collect the results, `filter(r => r?.error)`, fail the whole action if any failed. An UPDATE on one of N derived tables can silently fail while the function reports success — leaving raw_records marked deleted but a derived row still visible.
- **Fire-and-forget AFTER `revalidatePath` lets stale cache leak.** If a derived/cached computation must match a mutation, `await` it before the revalidate. Fire-and-forget is only safe when the consumer tolerates eventual consistency.
- **Strict `>` CHECK on timestamp pairs silently rejects single-entry users.** `check (period_end > period_start)` rejects inserts when a first-submit user's oldest `created_at` equals `now` (or clock drift lands them equal). Either relax to `>=` OR guarantee `period_end = max(periodStart + 1ms, now)` at write time. Caught when migration 0003's derived_insights CHECK combined with clock equality on a first-submit regenerate — insert silently failed, cache never populated, page fell through to live compute indefinitely.
- **Wipe-then-insert to refresh cached derived rows must inspect `.error` on both calls.** `await sb.delete()` + `await sb.insert()` with no error check lets a successful delete + failed insert leave the user with an empty cache until the next successful regen. Capture the INSERT-after-DELETE failure to Sentry with a distinguishing tag so it's diagnosable separately from "regenerate throw."
- **Positional encoding in `jsonb` arrays is fragile when entries can be absent.** `supporting_pattern_ids = [negTag?, posTag?]` where either can be omitted — readers that do `tags[0] as NegTag; tags[1] as PosTag` silently misread positive-only rows. Fix: always emit full-arity arrays with empty-string placeholders (`[negTag ?? "", posTag ?? ""]`), or store a structured object.

### React & state

- **React strict-mode double-mounts fire `useEffect` twice.** Effects doing server writes (flush pending onboarding, submit, insert) must be idempotent via `useRef` guard: `if (flushStarted.current) return; flushStarted.current = true;` at the top of the effect, PLUS server-side dedupe. `useState` is async and cannot prevent the race.
- **Picker state must reset when its parent selection changes.** Changing `personId` must also clear `threadId`. Otherwise submit sends a stale thread from the prior person.
- **Step-based forms must key any mic/camera/sensor-holding component by the current step.** React reuses instances at the same tree position; a `<VoiceInput>` or `<PersonPicker>` holding a MediaRecorder, timer, or websocket won't unmount between steps and its async transcript can later fire against the wrong field. Force fresh instances with `key={currentStep.key}` even if the component only appears in one step today.
- **Undo/redo buffers must invalidate on every parent-state mutation path, not just the flow that created them.** A voice-commit writes a snapshot ref for Redo; any *other* deliberate user action that mutates the same parent state (X/clear button, picking a new suggestion, relationship-domain change) must null the buffer before the next rearm event. Plain typing that doesn't clear is the only path that keeps the buffer alive.

### Mobile UX

- **iOS Safari zooms on focus when input font-size is <16px.** Use `text-base` or larger on email/password/textarea inputs. `text-sm` silently breaks the mobile login flow.
- **`mousedown` for outside-click dismiss doesn't work reliably on iOS Safari.** Use `pointerdown` — covers mouse and touch uniformly.
- **Keyboard-open dropdowns need `scrollIntoView({ behavior: "smooth", block: "nearest" })`** on open, plus a bottom spacer div, or the dropdown renders entirely behind the mobile keyboard.
- **16px native checkbox is a dead tap target.** Wrap the whole row in `<label>` with `min-h-11` and `cursor-pointer`; checkbox + text as children. iOS 44pt / Android 48dp guideline.
- **`pb-28` on every hub/list page inside `(app)/`.** The bottom tab bar eats the last card without it.
- **`text-zinc-400` at `text-xs` fails WCAG AA contrast (3.5:1).** Use `text-zinc-500` minimum for body/label; `text-zinc-600` for `text-xs` labels. zinc-400 only acceptable for decorative/non-essential text.
- **PWA manifest is required for "Add to Home Screen" on mobile.** Minimum: `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, `icons` (192 + 512). Link from root-layout metadata.
- **Menu links to unbuilt pages are live 404s.** Every nav link must point to an existing page. If a feature isn't built, remove the link or create a placeholder page — users seeing a 404 inside the app destroys trust.

### Error paths & UX

- **Error-path UX must offer a next action, not a dead end.** On write-succeeds-AI-fails, never land on "Done → back to /coach" — offer "Try again for coaching feedback" (safe because the idempotency key dedupes).
- **Don't persist telemetry fields until a consumer reads them.** Every counter or sticky-flag rots or lies without a pipeline or dashboard reading it. Add telemetry when a consumer exists, not speculatively.

### Security (beyond playbook §16.4)

- **Origin check applies to enumeration GETs, not just mutating endpoints.** A GET listing user-scoped metadata leaks via fetch-based CSRF from a compromised page. Same three-line `checkOrigin()` used on writes.
- **`Origin` header is absent on same-origin GET navigations (`<a href download>`, form submit, typed URL).** `checkOrigin()` that only compares Origin/Host will 403 every Download button. Check `Sec-Fetch-Site` first (accept `same-origin` and `none`, reject `same-site` + `cross-site`), fall back to Origin/Host when `Sec-Fetch-Site` is absent.
- **Per-day rate limit on enumeration reads.** A compromised session at 30 requests/min scrapes entire history at 43,200 requests/day unseen. 1000/day per user is generous and caps the data bleed. Same rule as writes (playbook §6) extended to reads.
- **Open redirect via `next` query param on auth callback.** Validate: starts with `/` AND does NOT start with `//`. Applies to any server-returned redirect value used with `router.replace()`.
- **Null-sentinel in cross-account guards defeats the check when "null" is the common safe-path case.** `if (hint && hint !== currentHint)` skips the check when `hint === null` — exactly the pre-auth case the guard exists for. Either require a non-null hint at stash time, OR bind the stash to a recency signal (user.created_at within N minutes of stashedAt).
- **Middleware + route-level auth gates enforcing the same redirect is one source of truth too many.** Inventory `middleware.ts` before adding an `(auth)/layout.tsx`-style gate. Pick one owner — either middleware handles base redirects and the page layer adds profile-aware routing, OR the layout deletes itself and accepts the double-hop.

### Sentry / observability

- **`beforeSend` must scrub `event.exception.values[*].value`, not just `request.data` and `extra`.** Anthropic `APIError.message` on 4xx stringifies the full request body (echoes the prompt). OpenAI Whisper does the same. Supabase `PostgrestError.message`/`details` includes column values on conflict. Sentry writes those into `exception.values[*].value`, which default scrub-spec tutorials never touch. Redact every `ex.value` in a shared `scrubEvent`, OR wrap at the capture site with a synthetic `new Error("short_tag")`.
- **Configure `beforeBreadcrumb` before enabling the DSN.** Default Breadcrumbs capture `console` args (which stringify raw errors, bypassing `beforeSend`) and fetch/xhr URLs (including `?q=` search terms). `beforeBreadcrumb` returns `null` for `category === "console"` and strips everything after `?` from `data.url`.
- **`tracesSampleRate: 0` unless a tracing consumer exists.** Transactions flow through a separate pipeline — `beforeSend` doesn't scrub them. Tracing events include full URL + query + route metadata. Collect-now-use-later costs privacy budget for no benefit and can't be retroactively scrubbed.
- **Latch captures in per-request fallback paths with a cooldown.** `Sentry.captureException` inside rate-limit.ts's Upstash fallback catch fires once per request during an outage — thousands per minute on a busy instance, event quota exhausts, the alert that would have said "Upstash is down" never fires. Module-level `lastCaptureAt` + 5-min cooldown for any capture in a path hit on every request during a degraded state.

### Pure EQ modules & insights

- **Heuristic extractors need an intensity gate before keyword matching.** A user with `beforeRating: 2` mentioning "deadline" shouldn't get tagged `recurring_trigger_pressure`. Low-intensity entries are noise, not pattern.
- **Keyword checks run BEFORE intensity heuristics.** "I was criticized" at high intensity should tag `recurring_trigger_criticism` (specific), not `escalated_after_trigger` (generic). Keywords are more informative than intensity alone.
- **Positive counter-patterns need the same `emergingTagCount` (2+) as negative patterns.** A single observation is noise, not insight. Applies to "How You Tend to Land", per-person positive patterns, AND PatternCard's `counterObservationsThisPeriod`. Any new pattern surface must apply the same ≥2 rule — if a spec defaults to ≥1, override to ≥2 during review (memory: `feedback_rabbit_holes_avoided.md` PatternCard counter-obs entry).
- **Window-based evolution needs a `"dormant"` verdict — treating (prior=0, current=0) as "steady" misleads.** A tag that qualified all-time (distinct_count ≥ 2) but has zero observations in the last 28 days is not steady — it's absent. Rendering "Steady, Minus icon" tells a returning user the pattern is stable when in fact they haven't triggered it in weeks. Add a sixth verdict (`dormant`) and render it as "No recent activity" so the signal reads honestly.
- **Schema contractions are lossy forward: renderers must be field-presence-based.** Old JSONB rows keep their original fields; new rows don't. No top-level destructuring of expected fields, no filtering out legacy rows by schema version, no assuming a new-shape field exists on every historical row. Fields cut from schema-v(N+1) are recoverable only from rows written at schema-v(N).
- **Schema-shape discipline: remove fields that duplicate their question's corrective function; remove paired do/don't fields that operate at the same level.** Diagnosis-plus-answer pairs raise cognitive load without adding action. Keep pairs only when they operate at different levels (a strategy move vs a phrase-level opener).
- **Auto-committed transcription needs a one-tap redo path per mounted field instance.** Full confirmation banners add too much friction for mobile/walking use, but silent commit with no undo lets speech errors flow straight into model input.
- **`resolved_at` must be cleared when un-resolving.** Setting it on "resolved"/"ended" but not clearing it on revert to "open" leaves a stale timestamp. Always explicitly set `resolved_at: null` in the non-terminal branch.
