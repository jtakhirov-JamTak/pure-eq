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

- Revenue model: 3-day free Coach window (1 free Prepare + 1 free Review) plus 7-day free Tools window (unlimited Overwhelmed + Triggered), both anchored to onboarding completion. After each window, $8.99/month or $69.99/year (cancel anytime). Insights is paid-only.
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
- `src/components/app-shell.tsx` — top bar + bottom tabs + menu (shared across `(app)` and `/tools` segments)
- `src/app/(app)/coach/{prepare,review}/page.tsx` — core coach flows (multi-step + AI)
- `src/app/tools/{page,layout,tools-hub-locked}.tsx` + `src/app/tools/{overwhelmed,triggered}/{page,*-client}.tsx` — tools subtree lives outside `(app)` so its 7-day free window can gate without triggering the broad `(app)` paywall redirect
- `src/app/(app)/insights/page.tsx` — weekly reflection page (StyleBox + ReflectionCard)
- `src/components/insights/{StyleBox,ReflectionCard,ReflectionKickoff}.tsx` — reflection UI
- `src/app/api/insights/generate/route.ts` — weekly reflection generation (Opus 4.7, 7-day idempotent)
- `src/app/(app)/history/{page,history-list,actions}.tsx` — history list + soft delete action
- `src/app/admin/{page,users,users/[id]}/page.tsx` — admin dashboard + user management
- `src/app/onboarding/page.tsx` — 9-question quiz + routing hub
- `src/app/paywall/` — paywall gate + pricing UI
- `src/app/api/coach/{prepare,review}/route.ts` — AI-backed coach endpoints
- `src/app/api/tools/{overwhelmed,triggered}/route.ts` — tool write endpoints
- `src/app/api/{persons,history,subscribe,transcribe,auth/callback}/route.ts`
- `src/lib/{validation,check-origin,rate-limit,subscription,require-access,admin,onboarding,verify-ownership,utils}.ts`
- `src/lib/insights/{generate,reflection-input,types}.ts` — weekly reflection orchestrator + input helper
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
- Paid-only gates use helpers in `src/lib/require-access.ts` — `requirePaidAccessPage/Api`, `requireToolsAccessPage/Api`, `hasToolsAccess`. Do NOT inline the `isAdmin + checkSubscription + redirect/403` block; policy drift is the whole reason the helpers exist
- Gate `/dev/*` routes with `if (process.env.NODE_ENV === "production") notFound();`

## Lessons Learned

Universal traps (Zod `.min(1)`/`.int()`/length-uniqueness, auth/rate-limit/origin-check/magic-byte patterns, idempotency keys, raw+derived + AI-after-both-inserts, stale-closure refs, wall-clock timers, fetch `res.ok`, external service fallback, `process.env.X!`, etc.) live in `docs/Engineering_Playbook.txt` §3–§16 — don't re-document them here. Entries below are Pure-EQ-specific repo rules or lessons not yet generalized.

### Access gates & monetization

- **`src/lib/require-access.ts` is the single source of truth for paid-only and Tools gates.** Five helpers: `requirePaidAccessPage/Api`, `requireToolsAccessPage/Api`, `hasToolsAccess`. Do not inline the `isAdmin + checkSubscription + redirect/403` block — drift between the paid-only policy (`!hasAccess`) and the Tools policy (`!hasAccess && !toolsWindowActive`) is exactly what the helpers prevent.
- **`checkSubscription` takes a single `userId` arg and is wrapped in `React.cache()`.** Creates its own `supabase` inside (request-scoped via cookies). Dedupes across layout + page + helper within one server render — if you add a caller that passes a supabase client, it breaks the cache silently. Always call `checkSubscription(user.id)`, never `checkSubscription(supabase, user.id)`.
- **Admin detection in gates uses sync `isAdmin(user.email)` (env var `ADMIN_EMAIL`), not DB-role-aware `checkAdmin`.** Consistent with `(app)/layout.tsx`. If DB-role admins are ever supported, switch `src/lib/require-access.ts` AND the layout at the same time — asymmetry would paywall a DB-role admin.
- **The `(app)/layout.tsx` broad gate is now a Coach-specific backstop, not the primary paid-only enforcement.** It fires only on `!hasAccess && (bothFreeUsed || freePeriodExpired)`, which covers `/coach`, `/coach/prepare`, `/coach/review`. Every other paid surface (`/insights`, `/history`, `/coach/repair`, `/coach/threads*`) now gates itself via `requirePaidAccessPage`. Don't delete the layout gate — it stops unpaid day-4+ users from reaching Coach hub / free-used Prepare or Review, which the page helpers don't cover.
- **Access anchor column (`user_profiles.created_at`) must stay user-unwritable.** Migration 0020 dropped `user_profiles_delete_own` — delete + retake would have reset the 7-day Tools window. If retake ever needs to clear old profile rows, go through the service-role client. Same rule as migration 0017 for `free_*_used_at` / `status` / `role`.

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
- **`maybeSingle()`, bare `.select()`, `.upsert()`, and `.update()` do NOT throw on DB errors.** They return `{ data: null, error: ... }`. Any user-facing aggregation route must inspect `.error` on every query; otherwise a transient DB outage renders "No entries yet." across every section and the user concludes their data is gone. Same trap on fire-and-forget writes inside a `try/catch` block — the catch catches thrown exceptions only, not PostgREST `{ error }` returns. Wrap the write with `const { error } = await ...; if (error) Sentry.captureException(...)` (cooldown-latched if the call site fires per-request, per the rate-limit.ts pattern). The Prompt 2 multi-tag observation upserts hit exactly this trap — RLS or schema drift would have silently stopped all observation writes with no Sentry signal.
- **`Promise.all` over DB writes hides per-row failures.** Collect the results, `filter(r => r?.error)`, fail the whole action if any failed. An UPDATE on one of N derived tables can silently fail while the function reports success — leaving raw_records marked deleted but a derived row still visible.
- **Fire-and-forget AFTER `revalidatePath` lets stale cache leak.** If a derived/cached computation must match a mutation, `await` it before the revalidate. Fire-and-forget is only safe when the consumer tolerates eventual consistency.
- **Strict `>` CHECK on timestamp pairs silently rejects single-entry users.** `check (period_end > period_start)` rejects inserts when a first-submit user's oldest `created_at` equals `now` (or clock drift lands them equal). Either relax to `>=` OR guarantee `period_end = max(periodStart + 1ms, now)` at write time. Caught when migration 0003's derived_insights CHECK combined with clock equality on a first-submit regenerate — insert silently failed, cache never populated, page fell through to live compute indefinitely.
- **Wipe-then-insert to refresh cached derived rows must inspect `.error` on both calls.** `await sb.delete()` + `await sb.insert()` with no error check lets a successful delete + failed insert leave the user with an empty cache until the next successful regen. Capture the INSERT-after-DELETE failure to Sentry with a distinguishing tag so it's diagnosable separately from "regenerate throw."
- **Positional encoding in `jsonb` arrays is fragile when entries can be absent.** `supporting_pattern_ids = [negTag?, posTag?]` where either can be omitted — readers that do `tags[0] as NegTag; tags[1] as PosTag` silently misread positive-only rows. Fix: always emit full-arity arrays with empty-string placeholders (`[negTag ?? "", posTag ?? ""]`), or store a structured object.
- **Unique-index migrations need a pre-flight dedup CTE.** `CREATE UNIQUE INDEX IF NOT EXISTS` aborts the whole migration on the first duplicate row with no automatic remediation. Even when the live writers always dedup, partial migration replays, hand-edits, or operator-runs-without-checking can leave dupes. Prepend `WITH ranked AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY <conflict_cols> ORDER BY id) AS rn FROM <table>) DELETE FROM <table> WHERE id IN (SELECT id FROM ranked WHERE rn > 1);`. Idempotent on a clean DB. Same defensive principle applies to `ALTER ... NOT NULL` and `ALTER ... CHECK` migrations: defend against existing rows that violate the new constraint with a one-shot pre-flight before the structural change.
- **Server components that parallel-fetch via `Promise.all` must inspect `.error` on every result.** Same trap as `maybeSingle()`/`upsert()`/`update()` — PostgREST returns `{ data: null, error }` on RLS mis-config, schema drift, or transient outage rather than throwing. A server component defaulting to `.data ?? []` on a failed read renders the empty/zero state with no Sentry signal. Pattern: module-level `Map<kind, lastCaptureAt>` + per-kind 5-min cooldown so a failing query during an outage emits at most one event per kind per 5 min across the instance, never flooding. `src/app/(app)/insights/page.tsx` has the reference implementation for 5 parallel reads.
- **Cache-version guards must apply symmetrically across all `insight_type` / row-type families in `derived_insights`.** `top_pattern` reads guard on `row.generator_version === GENERATOR_VERSION`; `person_pattern` and any future insight_type must do the same (fall-all-or-nothing: if any row fails the version check, recompute the whole type live, don't render mixed). Playbook §16.17. Asymmetric application makes `generator_version` bumps silently land stale shapes into the new renderer for the unguarded type.
- **Union-typed string columns read from DB need runtime narrowing, not a blind `as` cast.** `row.confidence_level as "emerging" | "established"` propagates a lie if the migration hasn't run, a legacy row exists, or the enum expands. Use `row.confidence_level === "established" ? "established" : "emerging"`. Same rule as `isPatternSnapshot`/`isComparatorSnapshot` defensive reads for jsonb, extended to typed string columns. Playbook §16.14.
- **Writing a NEW sentinel/enum value into a REUSED column must check that column's existing CHECK constraint — schema tests and `tsc` won't catch it.** When a redesign repurposes an existing column with a new discriminator (e.g. lean Prepare stamping `prepare_entries.path = 'lean_v1'` where the old CHECK only allowed `'path_a'/'path_b'`), the insert 400s at runtime with `violates check constraint <name>`, the cleanup-on-insert-failure deletes the raw row, and the user sees a generic "Could not save" with NO row in the DB. Unit tests pass because they exercise the Zod schema + field mappings, not a live insert against the real constraint. Before shipping a slice that writes a new value into any reused column, `select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.<table>'::regclass and contype='c'` and widen the relevant CHECK in the same migration (additive: `drop constraint if exists` + re-add with the superset, then `notify pgrst, 'reload schema'`). Caught on the 2026-05-30 Prepare lean-slice QA; fix in migration 0040.

### React & state

- **React strict-mode double-mounts fire `useEffect` twice.** Effects doing server writes (flush pending onboarding, submit, insert) must be idempotent via `useRef` guard: `if (flushStarted.current) return; flushStarted.current = true;` at the top of the effect, PLUS server-side dedupe. `useState` is async and cannot prevent the race.
- **Picker state must reset when its parent selection changes.** Changing `personId` must also clear `threadId`. Otherwise submit sends a stale thread from the prior person.
- **Step-based forms must key any mic/camera/sensor-holding component by the current step.** React reuses instances at the same tree position; a `<VoiceInput>` or `<PersonPicker>` holding a MediaRecorder, timer, or websocket won't unmount between steps and its async transcript can later fire against the wrong field. Force fresh instances with `key={currentStep.key}` even if the component only appears in one step today.
- **Undo/redo buffers must invalidate on every parent-state mutation path, not just the flow that created them.** A voice-commit writes a snapshot ref for Redo; any *other* deliberate user action that mutates the same parent state (X/clear button, picking a new suggestion, relationship-domain change) must null the buffer before the next rearm event. Plain typing that doesn't clear is the only path that keeps the buffer alive.
- **A select-button that calls `setData(...)` and `submit(...)` in the same tick reads stale state inside submit.** React `setState` is asynchronous; the submit closure still sees pre-pick `data`, the just-picked enum field posts as undefined, Zod 400s, the UI says "Could not save." Pass the chosen value into the submit handler explicitly (`handleSubmit({ override: { field: opt.value } })`) and merge with `data` inside the handler. Caught when 4 of 8 "What needs to happen next?" Review options bricked the form. The safe-by-construction shape — `setFieldValue` then `setStep(+1)` (Prepare relationship-select), or `handleSubmit(value)` taking the value as a positional arg (Tools `handleSubmit(feeling)`) — does NOT have this bug; only the set-then-submit-in-same-tick variant does.

### Mobile UX

- **iOS Safari zooms on focus when input font-size is <16px.** Use `text-base` or larger on email/password/textarea inputs. `text-sm` silently breaks the mobile login flow.
- **`mousedown` for outside-click dismiss doesn't work reliably on iOS Safari.** Use `pointerdown` — covers mouse and touch uniformly.
- **Keyboard-open dropdowns need `scrollIntoView({ behavior: "smooth", block: "nearest" })`** on open, plus a bottom spacer div, or the dropdown renders entirely behind the mobile keyboard.
- **16px native checkbox is a dead tap target.** Wrap the whole row in `<label>` with `min-h-11` and `cursor-pointer`; checkbox + text as children. iOS 44pt / Android 48dp guideline.
- **`pb-28` on every hub/list page inside `(app)/`.** The bottom tab bar eats the last card without it.
- **`text-zinc-400` at `text-xs` fails WCAG AA contrast (3.5:1).** Use `text-zinc-500` minimum for body/label; `text-zinc-600` for `text-xs` labels. zinc-400 only acceptable for decorative/non-essential text.
- **Text links at `text-xs` need a tap target, not just a click target.** A bare `<a className="text-xs underline">` is ~12-14px tall — well below the 44pt iOS / 48dp Android minimum the checkbox rule already calls out. Fix with `inline-flex min-h-11 items-center px-2`. Same bar as checkboxes; applies to any intentionally-subtle link (retake profile, "edit", "reset", footer actions).
- **PWA manifest is required for "Add to Home Screen" on mobile.** Minimum: `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, `icons` (192 + 512). Link from root-layout metadata.
- **Menu links to unbuilt pages are live 404s.** Every nav link must point to an existing page. If a feature isn't built, remove the link or create a placeholder page — users seeing a 404 inside the app destroys trust.

### Error paths & UX

- **Error-path UX must offer a next action, not a dead end.** On write-succeeds-AI-fails, never land on "Done → back to /coach" — offer "Try again for coaching feedback" (safe because the idempotency key dedupes).
- **Don't persist telemetry fields until a consumer reads them.** Every counter or sticky-flag rots or lies without a pipeline or dashboard reading it. Add telemetry when a consumer exists, not speculatively.
- **Label-prefix renderers must not duplicate the data's prefix.** A renderer that emits `"Status: " + lowercaseFirst(data.status)` quietly produces `"Status: status pending"` if every status string starts with "Status". Audit data fields for leading words that match the rendered label and drop the duplicate at the data layer (cleaner than detect-and-strip in the renderer). Caught when 16/16 `OBSERVATION_TAG_COPY.showsUpWhen` entries started with "When" while the renderer prepended "Shows up when " — every Pattern card displayed "Shows up when when…" in production for at least one commit.
- **Empty-state copy: one render shape per state, not conditional title-override plus always-rendered explainer.** `{state === X ? "Short title" : longMessage}` stacked on top of `{state === X && <p>{longMessage}</p>}` renders two lines for state X and one line for others — reads as a typo. If the design needs title + explainer, give every state both fields (some can be empty) and render unconditionally; if one line is enough, let the message ride alone. Playbook §16.15. Caught on the Insights 3-box refactor where the `no_entries` branch double-printed for brand-new users.

### Security (beyond playbook §16.4)

- **Origin check applies to enumeration GETs, not just mutating endpoints.** A GET listing user-scoped metadata leaks via fetch-based CSRF from a compromised page. Same three-line `checkOrigin()` used on writes.
- **`Origin` header is absent on same-origin GET navigations (`<a href download>`, form submit, typed URL).** `checkOrigin()` that only compares Origin/Host will 403 every Download button. Check `Sec-Fetch-Site` first (accept `same-origin` and `none`, reject `same-site` + `cross-site`), fall back to Origin/Host when `Sec-Fetch-Site` is absent.
- **Per-day rate limit on enumeration reads.** A compromised session at 30 requests/min scrapes entire history at 43,200 requests/day unseen. 1000/day per user is generous and caps the data bleed. Same rule as writes (playbook §6) extended to reads.
- **Open redirect via `next` query param on auth callback.** Validate: starts with `/` AND does NOT start with `//`. Applies to any server-returned redirect value used with `router.replace()`.
- **`next` redirect validation must also reject backslashes and ASCII control chars.** Older browsers (and some URL normalizers) fold `/\evil.com` → `//evil.com`, bypassing the leading-`/` + not-leading-`//` gate. Tabs/CR/LF and other C0 control chars embedded in `next` can bypass header parsers or log-injection filters. Extend the validator: `/^\/(?!\/)/.test(next) && !/[\\\x00-\x1f\x7f]/.test(next)`.
- **OAuth stuck-loading needs a 10-second re-arm timer.** `signInWithOAuth` can resolve cleanly while the browser never navigates — popup blockers, extensions, cross-site-cookie policy. Without a timer the CTA stays disabled and the user assumes the feature is broken. Start a 10s `setTimeout` after the call; on fire, re-arm the CTA with diagnostic copy ("Sign-in didn't open. Tap again, or use email below."). Do NOT clear the timer on success — the browser is about to leave the page; clearing would let a blocked-redirect-that-half-succeeded trap the user.
- **`oauthInFlight` useRef guard on social sign-in CTAs.** Double-tap on a slow network fires `signInWithOAuth` twice — some providers create two consent-screen tabs, both racing. `const inFlight = useRef(false); if (inFlight.current) return; inFlight.current = true;` at the top of the handler; clear in the catch. `disabled` on the button is UX, `useRef` is the guarantee.
- **Null sentinel for deprecated analytics fields, not a value that will lie.** When a column remains for legacy back-compat but new writes no longer populate it meaningfully, write `null` — don't default to the first enum value, don't carry forward a stale prior answer. Analytics queries can filter `WHERE X IS NOT NULL` to recover the legacy cohort cleanly; a non-null sentinel contaminates every aggregate. Paired rule: "Don't persist telemetry fields until a consumer reads them" — same spirit, read-side.
- **Null-sentinel in cross-account guards defeats the check when "null" is the common safe-path case.** `if (hint && hint !== currentHint)` skips the check when `hint === null` — exactly the pre-auth case the guard exists for. Either require a non-null hint at stash time, OR bind the stash to a recency signal (user.created_at within N minutes of stashedAt).
- **Middleware + route-level auth gates enforcing the same redirect is one source of truth too many.** Inventory `middleware.ts` before adding an `(auth)/layout.tsx`-style gate. Pick one owner — either middleware handles base redirects and the page layer adds profile-aware routing, OR the layout deletes itself and accepts the double-hop.

### Sentry / observability

- **`beforeSend` must scrub `event.exception.values[*].value`, not just `request.data` and `extra`.** Anthropic `APIError.message` on 4xx stringifies the full request body (echoes the prompt). OpenAI Whisper does the same. Supabase `PostgrestError.message`/`details` includes column values on conflict. Sentry writes those into `exception.values[*].value`, which default scrub-spec tutorials never touch. Redact every `ex.value` in a shared `scrubEvent`, OR wrap at the capture site with a synthetic `new Error("short_tag")`.
- **Configure `beforeBreadcrumb` before enabling the DSN.** Default Breadcrumbs capture `console` args (which stringify raw errors, bypassing `beforeSend`) and fetch/xhr URLs (including `?q=` search terms). `beforeBreadcrumb` returns `null` for `category === "console"` and strips everything after `?` from `data.url`.
- **`tracesSampleRate: 0` unless a tracing consumer exists.** Transactions flow through a separate pipeline — `beforeSend` doesn't scrub them. Tracing events include full URL + query + route metadata. Collect-now-use-later costs privacy budget for no benefit and can't be retroactively scrubbed.
- **Latch captures in per-request fallback paths with a cooldown.** `Sentry.captureException` inside rate-limit.ts's Upstash fallback catch fires once per request during an outage — thousands per minute on a busy instance, event quota exhausts, the alert that would have said "Upstash is down" never fires. Module-level `lastCaptureAt` + 5-min cooldown for any capture in a path hit on every request during a degraded state.

### Pure EQ modules

- **Auto-committed transcription needs a one-tap redo path per mounted field instance.** Full confirmation banners add too much friction for mobile/walking use, but silent commit with no undo lets speech errors flow straight into model input.
- **`resolved_at` must be cleared when un-resolving.** Setting it on "resolved"/"ended" but not clearing it on revert to "open" leaves a stale timestamp. Always explicitly set `resolved_at: null` in the non-terminal branch.

### Weekly reflection (Insights)

- **Opus 4.7 is used ONLY in the weekly reflection generator.** Coach / Review / Repair stay on Sonnet 4.6 (pinned via 2026-04-20 blind eval, memory `project_coach_ai_config_pinned.md`). The two model configs live in separate files — `src/lib/insights/generate.ts` instantiates its own `new Anthropic(...)` so a future edit to one can't accidentally drift the other.
- **The 7-day idempotency short-circuit is the PRIMARY cost gate, not the rate limiter.** `generateReflection` returns the latest `weekly_reflections` row without calling Claude if it's <7 days old. Rate limits (3/week user) are defense-in-depth. There is no user action that forces an additional LLM call inside a week. Do not add a manual refresh button unless explicitly revisiting this decision.
- **No enum-string CHECKs on `weekly_reflections`.** `ai_json.mode` ("reflection" vs "refusal") is validated by Zod before INSERT. Duplicating the enum into a DB CHECK is exactly what drifted on migration 0003/0018. Inline comment in migration 0022 captures this; do not add one later "for safety."
- **INSERT errors on `weekly_reflections` fail loudly, not silently.** `/api/insights/generate` inspects `.error` and throws `ReflectionGenerationError("insert_failed")`; the route returns 500 + Sentry capture with `kind=insert_failed`. The page surfaces the error state. Fire-and-forget is banned on this path. Direct lesson from migration 0018 (writer-silently-failing incident).
- **Every reflection render shows a `Generated on YYYY-MM-DD` byline.** User-visible canary if the writer ever silently breaks again. Don't remove it "for cleaner UI."
- **Every LLM-returned quote must substring-match its cited source entry server-side.** `generateReflection` builds a per-record text lookup and drops observations whose quotes don't verify. If fewer than 2 observations survive, the response is rewritten to a refusal with `reason: "out_of_scope"` — never serve a partially-verified reflection.
- **Symmetric `generator_version` check on both reader and writer.** `src/lib/insights/generate.ts` exports `GENERATOR_VERSION = "reflection_v1"`; the page reads it and gates rendering on `row.generator_version === GENERATOR_VERSION`, mismatch falls through to ReflectionKickoff (Playbook §16.17 generalized). Bump the constant whenever the `ai_json` shape changes.
