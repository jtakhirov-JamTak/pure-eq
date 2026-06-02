# Pure EQ — implementation handoff (BYS + loop + router nav) — CORRECTED

> Corrected against live schema on 2026-06-01. Every change from the original draft is
> tagged **[CORRECTED]** with the source of truth. Net: structure and sequencing are
> unchanged; the schema facts and two scope decisions were fixed.

Repo: `jtakhirov-JamTak/pure-eq` (Next.js / React 19 / Supabase; Storm theme + FlowScreen
already merged). Ship the phases below as **separate feature branches + PRs, in the stated
order. One PR per phase. Do NOT combine phases.** Build + lint must pass before each PR.

## Global guardrails
- **Do not touch:** coin reserve/spend/refund/idempotency in `src/lib/coach/run-module.ts`
  or `src/lib/coins.ts`; the Stripe checkout/webhook paths; migration `0044`.
- **Do not touch:** Storm theme tokens in `globals.css`; `FlowScreen`; `useFlowViewport`
  (keyboard-aware one-question-per-screen plumbing). Reuse them.
- **Migrations:** the ONLY schema change permitted in this whole handoff is the optional
  **2-column BYS add in Phase 1.1b** (and only if you choose to persist the new inputs).
  Any other schema/enum/constraint/table change → **STOP and surface it; do not migrate.**
- Keep **one AI call per completed flow**; keep the **refusal** path and child-safety
  behavior intact everywhere.
- Do not change fields/routes/copy/monetization in modules a phase doesn't name — **except**
  the Pulse Check and Review prefill writers explicitly addressed in Phase 1.1e.
- Line numbers below may have drifted — find symbols by name, not by line.
- **[CORRECTED] Verify a column against `src/types/database.ts` (the generated, current
  shape), not a single create-table migration.** Columns get added in later migrations
  (e.g. `risk_context` was added in `0036`, `ai_tier` in `0038`, both absent from `0028`).

---

## Where things actually live (corrected map)

**[CORRECTED]** The original draft's symbol pointers were partly wrong. Accurate as of today:

- **BYS page + all flow/output code:** `src/app/(app)/coach/before-send/page.tsx`
  — `BYS_PAGES` (step defs), `MessageType` enum, `AiNormal`/`AiRefusal` types,
  `RESULT_FIELDS`, `VERDICT_LABEL`, `VERDICT_RIBBON`, tier state, the save→verdict→coins
  flow, the prefill reader. The `messageType` and `verdict` enums live **inline in this
  file**, NOT in `src/lib/coach/types.ts`.
- `src/lib/coach/types.ts` is the **`CoachModuleConfig` interface** (no enums).
- **Request Zod schema:** `src/lib/validation.ts` (the BYS request body, incl. `tier`).
- **AI output Zod schema + `ACTION_FIELDS`:** `src/lib/ai/schemas.ts`.
- **Module wiring (person/thread behavior, derived table, version stamp):** the BYS config
  consumed by `src/lib/coach/run-module.ts`. BYS is `personBehavior:"skip"` /
  `threadBehavior:"none"` — it attaches to **no person and no thread** (`coach/types.ts:42`,
  `0028:11`).

### BYS table — real columns (`before_you_send_entries`, `database.ts:56`)
`before_you_send_entry_id, user_id, raw_record_id, person_id, thread_id, draft_text,
message_type, intent_optional, risk_context, ai_verdict_json, ai_verdict_version, ai_tier,
outcome_json, is_complete, created_at, completed_at, deleted_at`.

- `person_id` / `thread_id` exist but are **always NULL** for BYS (kept for table symmetry).
- **[CORRECTED]** `risk_context` **is a real column** (added `0036_coach_sot_migration.sql`,
  not in `0028`). So the "don't repurpose `risk_context`/`intent_optional`" warning stands.
- **[CORRECTED]** `message_type` CHECK (`0028:32`) allows **seven** values:
  `conflict | check_in | apology | repair | ask | boundary | other` — NOT three. Defaulting
  to `"conflict"` is valid; **no migration needed** for this column.
- `ai_verdict_json` is freeform `jsonb` → the new output shape needs **no migration**.
- `outcome_json` is a **reserved, currently-unused** column for a future "did you send it?"
  follow-up (`0028:16`). Relevant to Phase 2 (see note there).

### Threads table — real name/columns (`conversation_threads`, `0001_init_core.sql:67`)
**[CORRECTED]** The table is `conversation_threads`, not `threads`. Columns:
`thread_id, user_id, person_id, title, thread_type, status, started_at, last_activity_at,
resolved_at`. `status` CHECK = `open | stabilizing | resolved | abandoned`. There is **no
json/metadata column** (this part of the original draft was right).

---

## PHASE 0 (do FIRST, as baseline) — measure loop demand · branch `chore/loop-metric`

Read-only; no app behavior change. Saved queries (NOT a persisted view, to honor the
"only the BYS migration is authorized" guardrail) reporting:
- **Prepare→Review return rate:** of users who completed a Prepare, the share who later
  completed a Review for the same person, plus median days between.
- **BYS funnel:** onboarded users → first BYS verdict → second verdict → repeat (3+).

SQL lives in `analytics/phase0_loop_baseline.sql`. **Run/snapshot BEFORE Phase 1 ships and
record the date in that file's header.** Phase 1 changes BYS conversion, so a pre-change
baseline is required; do not interpret the BYS-funnel numbers later without separating pre-
and post-Phase-1 users. Do not wire any of this into the UI.

---

## PHASE 1 — Restructure BYS inputs · branch `feat/bys-3q`

> **[CORRECTED] Framing:** this is **not** a simplification. Today's BYS is *1 required
> field (draft) + 2 optional (risk, intent)*. This replaces it with *3 required fields*,
> front-loading two text boxes before the draft. That is a friction **increase** at the
> impulse moment (people reach for BYS right before hitting send). It also **discards last
> session's BYS step-reorder** (draft→type→optional risk→optional intent — whose product
> veto was still pending). Confirm both are intended before building. The verdict-quality
> upside is the justification; go in with eyes open.

### 1a · Steps — exactly three, in order
| # | Title | Helper | Field key | Required |
|---|---|---|---|---|
| 1 | What is the situation? | Describe the facts. | `situationFacts` | yes |
| 2 | What outcome do you want this message to achieve? | What is your goal? | `desiredOutcome` | yes |
| 3 | Draft your message. | — | `draftText` (existing) | yes |

Remove `messageType`, `riskContext`, `intentOptional` from the user-facing steps. Reuse
existing per-field validation. Each step renders one-per-screen via the existing FlowScreen.

### 1b · Input persistence — MIGRATION DECISION
The BYS table has **no column** for `situationFacts` or `desiredOutcome`. Choose ONE:
- **Recommended:** add two nullable columns `situation_facts text`, `desired_outcome text`
  to `before_you_send_entries` in one small additive migration — the only migration
  authorized in this handoff. (Names don't collide: `prepare_entries` has its own
  `desired_outcome`, a different table.) Follow the repo migration tail convention, incl.
  `notify pgrst, 'reload schema';`. Regenerate `database.ts`.
- **Or:** do not persist them (pass to the AI only); they won't appear in history.
- **Do NOT** repurpose `risk_context`/`intent_optional` to hold them — both are real
  columns with their own meaning (name-vs-meaning drift).

Keep persisting `message_type` server-side — infer it from situation+draft, or **default to
`"conflict"`** (valid in the 7-value CHECK) so the column stays satisfied. **Never ask the
user for it.**

### 1c · Single flat tier — client AND server
Remove the Quick/Deep selector from BYS. Force `tier = "quick"` in the UI **and enforce it
server-side** (clamp `tier`→`"quick"` in the BYS request Zod schema in
`src/lib/validation.ts` or the BYS module config — *upstream* of the coin logic; do not
touch the reserve/spend/refund path). Flat **4 coins** (`COIN_COSTS.quick`).
- **[CORRECTED] UI note:** the verdict screen uses the shared `GetFeedbackScreen`
  (`components/coach/coin-ui`), which renders a Quick/Deep tier selector via `onTierChange`.
  For BYS you must hide/disable that selector (prop or a BYS variant) — `tier` is now fixed.
- Keep the save→verdict→coins flow and the "Check it again" rewrite (fresh idempotency key —
  leave as is). Paid verdict CTA label: **"Check my message"**.

### 1d · Output — verdict + three cards
> **[CORRECTED] Scope:** this is a **full output reshape**, not just "remove the Deep cards."
> Current `AiNormal` is `how_this_will_land / thing_to_cut / check_in_question` (+ Deep-only
> `what_its_missing / their_likely_reply`). Your three new cards replace **all** of them, and
> `cleaner_version` is a **brand-new capability** — today BYS has no "rewritten draft" card
> (`thing_to_cut` is just a verbatim quote to delete). So this touches the **prompt**, the
> **AI output Zod schema** (`src/lib/ai/schemas.ts`), `ACTION_FIELDS`, `AiNormal`,
> `RESULT_FIELDS`, and the version stamp. Price it as real prompt+schema work.

- One call returns: `verdict` + `main_risk` + `cleaner_version` + `why_this_works`. Remove
  the old Quick and Deep card fields.
- `RESULT_FIELDS` renders exactly: **Main Risk** → `main_risk`, **Cleaner Version** →
  `cleaner_version`, **Why This Works** → `why_this_works`.
- `VERDICT_LABEL` display strings → **Send** / **Revise** / **Do not send yet**. **Keep the
  internal verdict keys (`safe`/`risky`/`do_not_send`) unchanged** (data continuity for
  stored `ai_verdict_json`). Keep the verdict ribbon (`VERDICT_RIBBON`).
- The prompt **infers message type and risk internally**; they are no longer inputs.
- **Bump the AI version stamp** (`ai_verdict_version` value in the BYS module config) since
  the output shape changed — per the repo's "bump the DB version column on shape change"
  rule, even though `ai_verdict_json` itself is freeform and needs no migration.
- **Backward compatibility:** old rows carry the old card keys and lack the new ones. The
  render filter (`before-send/page.tsx:553`, drops fields that are missing/blank) means old
  entries render **verdict + zero cards** (be honest: not "fewer" — none, since the keys are
  all-new). They must **not error**. **[CORRECTED] Also check the History renderer**, not
  just this page — confirm an old BYS entry opened from `/history` renders safely too.

### 1e · Fix the Pulse→BYS and Review→BYS prefill handoffs (cross-module — required)
BYS reads a sessionStorage prefill (`pure-eq:bys-prefill`, key constant `PREFILL_KEY` in
`before-send/page.tsx`). The payload (`Prefill` type) carries `draftText`, `messageType`,
`sourceReviewEntryId` **or** `sourcePulseCheckEntryId`, plus `userId` + `stashedAt` (the
two-gate cross-account guard — keep both). Pulse Check (`use_bys` chip) and Review (repair
handoff) are the writers. After this redesign the prefilled draft lands on **step 3** behind
two new required steps the prefill doesn't fill, so the handoff would dead-end on an empty
`situationFacts` screen.
- **Required behavior:** keep the 3-step order; pre-populate `draftText` into step 3; keep
  `situationFacts`/`desiredOutcome` required (the check needs them); show the existing
  handoff banner (the `prefillSource` "repair"/"pulse_check" banner already in the file) so
  the user understands why setup comes first. `messageType` from the prefill maps to the
  server-side default (no UI step). Verify **both** handoffs reach the verdict without
  dead-ending.
- Update the Pulse/Review prefill **writers** only as needed to keep the payload valid (they
  may keep sending `draftText`/`messageType`; they need not send the new fields).
- *Optional enhancement (not required):* prefill `situationFacts` from the source entry via
  `sourcePulseCheckEntryId` / `sourceReviewEntryId` so the handoff user doesn't retype
  context.

### 1f · Acceptance / tests
- 3 questions, one per screen, no scroll, keyboard-safe (existing FlowScreen).
- Empty `situationFacts` blocks step 1; empty `desiredOutcome` blocks step 2; empty
  `draftText` blocks submit.
- No `messageType`/`riskContext`/`intentOptional` visible in the UI.
- BYS always charges `COIN_COSTS.quick` (4), even if a client sends `tier:"deep"`.
- One AI call returns verdict + the three named cards; verdict shows Send / Revise / Do not
  send yet; refusal path refunds and behaves exactly as before.
- "Check it again" mints a fresh idempotency key.
- `ai_verdict_json` stores the new shape with no migration; **old BYS history/results render
  without crashing** (verdict + no cards), verified from both the results screen and
  `/history`.
- Pulse→BYS and Review→BYS handoffs carry the draft through and reach the verdict.

---

## PHASE 2 — Lightweight in-app return loop · branch `feat/inapp-loop`

In-app only. **Do NOT** build push, service workers, cron, or email — surface loops inside
the app.

> **[CORRECTED — scope decision settled 2026-06-01]:** **BYS stays stateless.** The
> persistent return-loop covers **Prepare only** (Prepare auto-creates a
> `conversation_thread`, so it has something to attach follow-up entries to). **BYS does NOT
> spawn a thread** — making BYS thread/person-aware reopens the cold-start / wrong-target
> data-pollution path that was analyzed and deferred (memory `project_bys_rebuild_deferred`,
> critique #4). Do not add a person/thread to BYS in this phase.
>
> *(Deferred, not forbidden:* a future BYS follow-up could write to the **already-reserved
> `before_you_send_entries.outcome_json`** column on the same entry — stateless, no thread,
> no new column. Out of scope here; noted so it isn't rediscovered.)*

### Storage (resolved — follow this, don't improvise)
The `conversation_threads` table has **no json/metadata column**. So:
- Model each open Prepare loop using the **existing thread `status`/`resolved_at`** for open
  vs. closed, and store the follow-up answers as **linked entries** (free manual fields — no
  coins). Reuse the threads + "active conversations" surfaces.
- **If that does not fit, STOP and surface the gap. Do NOT add a `conversation_threads`
  metadata column or a new table without approval.**

### Behavior
- After a **Prepare result:** "How did it go?" / "What surprised you?" / "Did your read
  match reality?" → route into Review with the person/thread prefilled.
- Surface **open Prepare loops as a nudge card on Home** (reuse active-conversations).
  Tapping resumes the right flow with context.
- **[CORRECTED] No BYS post-verdict loop in this phase** (BYS is stateless — see scope note).

### Acceptance
- Completing a Prepare opens a follow-up (thread `status` open + linked entry).
- Home shows a nudge for open Prepare loops; tapping resumes correctly.
- No push/cron/SW/email added; no `conversation_threads`-schema change; coins logic
  untouched; **no thread/person added to BYS.**

---

## PHASE 3 — Router Home + collapse to 3 tabs · branch `feat/router-home`

Navigation/IA reorg + restyle that **reuses the merged Storm components**. Do not alter
theme tokens, `FlowScreen`, or `useFlowViewport`. Do not delete any module or route.
- **Bottom nav → 3 tabs:** `Home` · `Insights` · `Me`. `Me` = History, Profile, Settings,
  Coins (the `/coins` page stays as-is).
- **Header:** always-visible coin balance, one tap to `/coins`.
- **Persistent "I'm activated" affordance** (reachable from anywhere) → Regulate
  (Triggered/Overwhelmed). Not a bottom tab.
- **Home:** hero card "Check a message before you send it" → BYS (give BYS the hero slot,
  not just a chip). Below it, a **"What's going on?"** router:
  | Chip | Routes to |
  |---|---|
  | I'm about to talk to someone | Prepare |
  | Something feels off | Pulse Check |
  | It already happened | Review |
  | I need to fix it | Repair |
  Plus the open-loop nudges from Phase 2 (Prepare loops).
- Keep all routes and prefill handoffs working (incl. Pulse→BYS, Review→BYS). Presentation/
  IA + routing only — no field, payload, or monetization changes.

### Acceptance
- 3 bottom tabs; every module reachable; no dead routes.
- Home leads with the BYS hero, then router chips; Regulate reachable from anywhere; coin
  balance in header.
- Storm theme + FlowScreen + keyboard handling unchanged.

---

## Sequence
**Phase 0 (baseline) → Phase 1 → Phase 2 → Phase 3.** One PR per phase. Pause for review
between PRs; do not chain them in a single session.
