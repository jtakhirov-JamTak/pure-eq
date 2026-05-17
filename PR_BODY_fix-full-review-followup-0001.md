Closes 24 findings from the post-merge `/full-review` audit on PR #1's merged work (SOT compliance follow-up). 4 review agents (grill / security / staff architect / mobile) ran against `419d7aa..main`; the grill agent identified a **BLOCKER** that would have hard-bricked Page 5 for every Full Review user.

## What landed (in priority order)

### 🔴 BLOCKER (`fix1`, commit `c6cfaca`)
1. **`whatProtecting` StepDef on Review Full Page 5 lacked `requiredSubFields`.** `pageCanAdvance` fell into its default-object branch, which iterates every key and returns false when `text: ""`. The companion text is voluntary — the state ships as `{ chip, text: "" }` when the user only picks a chip — so the Next button stayed disabled with no error message. Fix: `requiredSubFields: ["chip"]`. Regression test added.

### 🟠 HIGH (`fix2`, commit `b3a4e6c`)
2. **Body-chip tap target ~35px** (textarea-with-body-chip). Added `flex min-h-11 items-center`.
3. **whatProtecting chips ~35px** (select-protecting-with-optional-text). Same fix.
4. **whatProtecting optional input** used zinc-300/zinc-400 (off-palette + AA fail). Swapped to ink/sky tokens.
5. **`--color-ink-muted: #6a7da3`** failed AA on top of the sky-hi gradient (~3.4:1). Darkened to **#4f6390** — now ~4.9:1 on sky-hi, ~5.8:1 on white. Still distinctly lighter than ink-soft for visual hierarchy.
6. **`src/lib/export.ts` silently omitted ~21 SOT cols** added across 0036 and 0037. User downloads were missing the empathy ladder, outcome, opener, trigger plan, felt-at-hardest-moment, calibration block, lesson trio, and 6-field repair branch. Extended `Pick<>` types + SELECT clauses + per-section formatters. Test fixtures refactored to use `blankPrepare()` / `blankReview()` helpers so future SOT additions only touch the helpers.

### 🟡 MEDIUM (`fix3`, commit `7b15dee`)
7. Pulse Check Page 1 density: added optional `rows` prop to `StepDef`; set `rows: 2` on `whenItShifted` (short-answer Q). Trims ~80px off Page 1.
8. Review Full Page 5 wall: deferred — splitting changes SOT-locked page count.
9. **`.trim()` swept across 57 `z.string().min(1).max(N)` occurrences** so whitespace-only POSTs fail at the API boundary (Playbook §16.11).
10. **`linkedPrepareEntryId` ownership guard**: every code path through `prePromptEnrich` that doesn't find a user-scoped snapshot now returns `linkedPrepareEntryId: null`. Closes a foreign-FK leak.
11. **`pageIndex` clamp moved into render path** via `safePageIndex`. Eliminates the one-frame blank-screen flash when back-nav + chip change shrinks PAGES.
12. **`select_calibration_chip` throws on missing `chipSet`** instead of silently rendering the wrong chips + 400'ing at submit.
13. **`createReviewSchema` cross-field requirement guard**: superRefine enforces SOT page-grouped requirements (whatYouDid + needsToHappenNext + forecast for both depths; Full adds feltAtHardestMoment + bodyLocation + feelingTracking + whatProtecting + lessonScreen + standalone-Page-5 / repair-branch field sets).
14. **`deriveRepairBranchActive` lifted** from `review/route.ts` to `page-flow.ts` so client + server can't drift.
15. **`path` vs `aiVersionValue` redundancy** documented: `ai_plan_version` is the authoritative shape selector going forward; `path` stays as a non-null sentinel for legacy filter-by-path readers.

### ⚪ LOW (`fix4`, commit `7141343`)
16. Eyebrow `text-[10px]` → `text-[11px]` (CLAUDE.md 11px floor).
17. `relationship` buttons `h-12` → `min-h-12 py-3` (don't clip 2-line labels at a11y scale 200%).
18. `TextareaThreeFieldLesson` `rowsOptional` reverted 2 → 3 (typing area collapsed to ~24px under mic button reserve).
19. `whatYouLearned` orphan field dropped from schema.
20. **`prepareSnapshot` calibration prepend extended** with 3 new Prepare SOT fields (`primaryEmotion`, `defaultPattern`, `neutralCheckQuestion`). Plumbed through `PrepareSnapshot` type, the SELECT clause in `findLinkedPrepareEntry`, and the `prePromptEnrich` hook.
21. `their_experience` legacy /history fallback: not-applicable (page doesn't render the column; export.ts handles it).
22. `buildPayloadFields` extra parens dropped; 30+ field object literal re-indented.
23. **`route-mappings.test.ts` extended** with 3 round-trip tests on `buildPayloadFields` (review happy path + repair-branch smuggle strip + prepare happy path).
24. `trigger_plan` legacy backfill: skipped (low value; legacy rows are <10 days old at most).

## Verification

- `npx tsc --noEmit` — clean
- `npm test` — **222/222** (was 219 on `main` post-merge; 3 new round-trip tests for `buildPayloadFields`)
- `npm run build` — clean across 38+ routes

## Risk

- **`fix3` schema change** is breaking for any direct API client posting Full Reviews without the SOT-required field set. The web UI already gates these via `pageCanAdvance`, but if there's an iOS/PWA/manual replay path that POSTed legacy-shape Full Reviews, those will now 422. No such caller exists in this repo.
- **Migration 0037 was already applied** on 2026-05-17 — these fixes touch app code only, no new SQL.

## Phone QA — re-verify items the BLOCKER fix unlocks

Add to the existing SOT-followup phone-QA checklist (in `session-context.md` deployment section):

1. **Full Review Page 5** — pick a `whatProtecting` chip but leave the optional companion text empty. Next button enables (previously bricked).
2. **Calibration chips and body chips** ≥44pt tap target.
3. **Page indicator at top of gradient** is readable on bright sky-hi background.
4. **Download Data export** from /settings shows all SOT fields (primary_emotion, default_pattern, neutral_check_question, trigger_plan, felt_at_hardest_moment, their_in_moment_experience, calibration block, lesson trio, expanded repair fields).
5. **Pulse Check Page 1** scroll height should be ~80px shorter than pre-fix.
6. **Review Full back-nav + chip flip** (e.g. `apologize` → `nothing`) no longer flashes a blank page during the page-count shrink.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
