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
