# Pure EQ

Mobile-first emotional intelligence coaching app (PWA). Helps users handle hard conversations through self-awareness, emotional regulation, empathic accuracy, and next-move judgment.

## Quick Start

```bash
cp .env.example .env.local   # Fill in your keys
npm install
npm run dev                  # http://localhost:3000
```

## Stack

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS + Supabase (PostgreSQL + Auth + RLS) + Anthropic Claude API + OpenAI Whisper API + Zod

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** — Project structure, conventions, lessons learned
- **[docs/Pure_EQ_Final.txt](./docs/Pure_EQ_Final.txt)** — Product spec (source of truth)
- **[docs/Engineering_Playbook.txt](./docs/Engineering_Playbook.txt)** — Reusable security and architecture patterns

## Commands

| Task        | Command          |
|-------------|------------------|
| Dev server  | `npm run dev`    |
| Build       | `npm run build`  |
| Type check  | `npx tsc --noEmit` |
| Lint        | `npm run lint`   |
| Regen types | `npm run db:types` |
