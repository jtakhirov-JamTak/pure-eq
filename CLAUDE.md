# CLAUDE.md

## Project Overview

Pure EQ — a mobile-first emotional intelligence coaching app (PWA).
Helps users handle hard conversations through self-awareness, emotional regulation,
empathic accuracy, and next-move judgment. Three product areas: Coach, Tools, Insights.

Solo founder, non-technical — explain in plain language, wait for approval before changing code.
When Claude makes a mistake, add the lesson to the "Lessons Learned" section below.

## Business Context

- Revenue model: $0.99 for 7-day trial, then $9.99/month, cancel anytime
- Onboarding produces a Communication Profile (9-question quiz) + one free AI output before paywall
- Product doc: docs/Pure_EQ_Final.txt (source of truth for all product decisions)
- Engineering playbook: docs/Engineering_Playbook.txt (reusable security/architecture patterns)

## Commands

| Task              | Command            |
|-------------------|--------------------|
| Dev server        | `npm run dev`      |
| Build             | `npm run build`    |
| Type check        | `npx tsc --noEmit` |
| Lint              | `npm run lint`     |

Environment: Requires `.env.local` with Supabase and Anthropic keys.

## Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Framer Motion
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
    layout.tsx                    # Root layout, fonts, metadata
    page.tsx                      # Landing page
    (auth)/login/page.tsx         # Login
    (auth)/signup/page.tsx        # Signup
    onboarding/page.tsx           # 9-question Communication Profile quiz
    (app)/layout.tsx              # Authenticated app shell (Coach/Tools/Insights tabs)
    (app)/coach/page.tsx          # Coach tab home
    (app)/coach/prepare/page.tsx  # Prepare flow
    (app)/coach/review/page.tsx   # Review flow
    (app)/tools/page.tsx          # Tools tab (I'm Overwhelmed / I'm Triggered)
    (app)/insights/page.tsx       # Insights tab (Profile + patterns)
    api/                          # API routes (all server-side)
  lib/
    supabase/client.ts            # Browser Supabase client
    supabase/server.ts            # Server Supabase client
    supabase/middleware.ts         # Auth middleware helper
    ai/prompts.ts                 # AI prompt templates (version-controlled)
    ai/schemas.ts                 # AI output Zod schemas
    validation.ts                 # All request validation schemas
    utils.ts                      # cn() helper, shared utilities
  components/
    ui/                           # Reusable UI primitives
    voice-input.tsx               # Voice + text dual input component
  types/
    database.ts                   # Supabase generated types
    index.ts                      # Shared app types
docs/
  Pure_EQ_Final.txt               # Product spec (source of truth)
  Engineering_Playbook.txt        # Security and architecture patterns
```

## Adding an API Endpoint

1. Zod schema → `src/lib/validation.ts`
2. Route handler → `src/app/api/{domain}/route.ts`
3. Auth check → use `getAuthUser()` from `src/lib/supabase/server.ts`
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

- **Email confirmation is DISABLED in Supabase Auth for dev speed.** Must be re-enabled before any real user touches the app. Shipping to production with email confirmation off means anyone can sign up with a fake or other-people's email addresses, which is both a security and abuse risk. Re-enable via Supabase dashboard → Authentication → Providers → Email → Confirm email.
- **Zod `length(N)` on arrays does not enforce element uniqueness.** A quiz submission schema that requires "9 answers" silently accepts 9 answers all with the same `questionIndex`. Always `.refine()` array schemas that have semantic keys to enforce the invariant — in Pure EQ we require exactly one answer per index 0-8. Discovered in /full-review as a real scoring-bypass exploit.
- **React strict-mode double-mounts fire `useEffect` twice.** Any effect that does a server write (flush pending onboarding, submit a form, insert a row) must be idempotent via a `useRef` guard OR a server-side dedupe check — `useState` is async and cannot prevent the race. Pattern we use: `if (flushStarted.current) return; flushStarted.current = true;` at the top of the effect, plus ordering the effect's cases so "already has row" is checked before "insert row."
- **iOS Safari zooms on focus when input font-size is <16px.** Always use `text-base` (16px) or larger on email/password/textarea inputs. `text-sm` (14px) breaks the mobile login flow in a way that's invisible in desktop dev. This is a hard iOS rule, not a preference.
- **`/dev/*` debug routes ship to production unless explicitly gated.** Every debug surface we keep should either be removed before launch or gated with `if (process.env.NODE_ENV === "production") notFound();` at the top of the page component. Pattern: dev-only routes get an env gate AND a comment noting they're dev-only.
- **sessionStorage is per-tab but survives cookie clears and logouts.** On shared devices it can leak data from one user's session to another user's new signup. Always stamp pending-persistence blobs with a user hint (email or id) and verify the hint matches the current session before using the data. Discard on mismatch.
- **Empty `catch {}` blocks during critical writes are how users silently lose work.** Every catch in a write path should at minimum `console.error` the message (NOT the full object or payload — no user content) AND surface an inline error to the user. CLAUDE.md already says "fail loudly" — this is the enforcement.
- **Two sequential inserts with no transaction = orphan risk on second failure.** Supabase JS doesn't support client-side transactions without a Postgres RPC function. For v0, the acceptable pattern is: insert source-of-truth row → try derived row → on derived failure, delete the source row we just wrote. An RPC is cleaner but not required at this scale.
- **`scoreProfile`-style fall-through defaults on empty data hide bugs.** A scoring function that runs on all-null input and returns the alphabetically-first enum value (because `Object.entries` ordering is stable) will silently produce "valid" profiles from garbage input. Always `throw` when there's genuinely nothing to score, and let the route map that to a 400. Never paper over empty input with a default.
- **Server re-scoring from raw inputs is non-negotiable.** Client may compute a result for display, but the database row must always be derived server-side from the raw answers the server actually received. This prevents tampering AND keeps the source-of-truth invariant clean for re-derivation.
- **When fixing many issues in one pass, defer the rabbit holes explicitly.** From the /full-review batch: adding a test framework (Vitest scaffolding + config + first test) was deferred as its own focused commit because it's 30-60 minutes of infrastructure setup with its own failure modes. Large refactors (file splits, moving the routing hub into middleware) were deferred because they're not bug fixes and can hide regressions in a big batch commit. Rule: a review-fix batch should fix bugs and hardening, not refactor architecture.
