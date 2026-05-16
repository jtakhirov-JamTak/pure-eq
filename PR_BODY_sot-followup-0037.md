# SOT compliance follow-up to 0036 — Coach modules

Restores SOT compliance across all four Coach modules after the 0036
migration. A diff against the locked 25-persona cross-eval surfaced 11
deviations grouped into 5 commits. Branch
`feat/sot-followup-0037`, ready to open via the GitHub UI:

https://github.com/jtakhirov-JamTak/pure-eq/pull/new/feat/sot-followup-0037

## Commits

| sha | Title |
|-----|-------|
| `d99f36c` | Pulse Check: restore SOT wording on Q7/Q8/Q9 + page restructure |
| `92f61cd` | Review Quick: SOT 5-Q layout + forecast wiring |
| `722cd50` | Review calibration: SOT chip taxonomy + per-row component rewrite |
| `49c432b` | Prepare: restore SOT-missing Qs + body chip relocation + migration 0037 |
| `dd7a9c0` | Review Full overhaul: SOT page layout + new card derivations + 0037 extend |

## SOT deviations closed (11)

**Pulse Check (Commit 1)**
1. Q9 (`signalNoiseObservation`) title now includes the 3–7 day window — the falsifiability anchor the cognitive arc rests on.
2. Q8 (`storyAndAlternative`) reframed from "more generous alternative" to "equally plausible alternative" — trains cognitive reappraisal instead of motivated reasoning. AI prompt line, TextareaTwoColumn labels, and step prompts all aligned.
3. Q7 (`theirsNotAboutYou`) title rewritten from leading ("Why might this not be about you?") to open with concrete categories.
4. Page restructure to match the SOT cognitive arc: setup_what_changed → story_vs_alternative → test_and_route.

**Review Quick (Commit 2)**
5. Quick page layout fixed: now 5 Qs across 2 pages (personName / whatHappened / observedInterpreted on P1; whatYouDid / needsAndForecast on P2). Removed `hardestMomentFeeling` from Quick (Full also drops it in Commit 5).
6. Forecast text wired through page submit → route → `review_entries.forecast` so the calibration loop has a forecast to score against later. Same wiring applies to Full (it had the chip on P4 already but silently dropped the forecast text).

**Review calibration (Commit 3)**
7. Calibration chip taxonomy replaced — old (matched/softer/harder, who-softened-first, what-floor-held) measured conversation flow, which doesn't close the Prepare → Review prediction loop. New taxonomy directly scores the forecast: compare (better/about_right/worse), shift (yes/partial/no/too_soon), floor (yes/mostly/no). Component rewritten from 3-rows-on-one-screen to per-row with `chipSet` prop. Page 5 calibration variant becomes 3 separate StepDef instances.
8. Repair-trigger fix (Change 3.4) verified as a **no-op before the commit** — shipped `REPAIR_TRIGGER_NEEDS` already matches SOT. Locked in via a new test so a regression that adds `set_boundary` or drops `clarify` fails the build instead of changing behavior silently.

**Prepare (Commit 4)**
9. Three SOT Qs missed by 0036 now present: `primary_emotion` (text + body chip, paired on P2), `default_pattern` (P2), `neutral_check_question` (P5). Migration 0037 adds the columns; `body_location` re-purposed semantically (off opener, onto primary emotion). `situation` moves from P2 to P1.

**Review Full (Commit 5)**
10. Page layout matches SOT: reality_split / self_state / impact_data / theirs / dynamic-P5. New Qs surface 8 SOT inputs that 0036 omitted (`felt_at_hardest_moment` + body chip, `feeling_tracking`, `easier_or_harder`, `treat_as_data`, `something_that_helped`, `signs_how_they_left`, `turning_point`, `theirInMomentExperience` semantic rename). `lesson_screen` 3-field block with first-required-others-optional UX. Page 5 shares `whatProtecting` + `lessonScreen` + `needsAndForecast` across calibration and standalone branches.
11. Repair branch wording sharpened on Q1, Q3, Q4, Q5 (Q2 already correct). New card-derivation guidance attaches to the AI system prompt on Full (treat_as_data → alternative_explanation, etc.).

## Migration 0037

Single SQL file, additive + nullable + idempotent:

- `prepare_entries.primary_emotion` (text)
- `prepare_entries.default_pattern` (text)
- `prepare_entries.neutral_check_question` (text)
- `review_entries.felt_at_hardest_moment` (text)
- Comment revisions on `review_entries.hardest_moment_feeling` (un-deprecates the wrong "replaced by feeling_tracking" mapping 0036 wrote — SOT treats `feeling_tracking` as a separate Q)
- Comment on `review_entries.feeling_tracking` (clarifies new semantic)

Founder applies via Supabase SQL Editor after merge.

## Version bumps

- `PROMPT_VERSION`: 5.0.0 → 5.1.0 (Pulse Check storyAndAlternative line, Prepare 3 new params + body-chip-on-primary-emotion semantic, Review Full card derivations)
- Prepare `aiVersionValue`: 7 → 8 (Commit 4) — distinguishes SOT-follow-up rows from 0036-shape; `path` sentinel "sot" → "sot_v2"
- Review `aiVersionValue`: 8 → 9 (Commit 5) — new SOT field set persists
- Pulse Check `aiVersionValue`: stays at 1 (output schema unchanged)
- BYS: untouched

## Verification

- `npm test`: 216/216 (was 170/170 on `main`; +46 new tests across schema, calibration, repair-trigger, Pulse / Prepare / Review prompts, Review Full SOT shape, optional-sub-field hook, route-mapping round-trips).
- `npx tsc --noEmit`: clean.
- `npm run build`: clean across 38+ routes.
- Per-commit checks ran at every commit boundary; no chained refactors.

## `/full-review` follow-up — 6 fix commits

After the initial 5 SOT-compliance commits landed, `/full-review`
surfaced 16 issues. All are addressed in 6 follow-up commits on this
branch:

| sha | Title | Fixes |
|-----|-------|-------|
| `5dc5cb9` | fix1: data-path bugs | #1 repair-fields-data-loss (BLOCKER), #2 trigger_plan never persisted, #3 theirExperience dead arg, #6 Prepare placeholder copy, #15 PROMPT_VERSION literal pin |
| `741d695` | fix2: server-side derivation + clamp + chip enums | #4 server derives repair_branch_active (ignores client), #5 pageIndex clamp on Repair flip, #10 calibration chip enums promoted to server-side Zod |
| `a34caa8` | fix3: mobile UX one-liners | #7 calibration chip min-h-11, #8 --color-ink-muted AA contrast bump |
| `d8cb852` | fix4: Page 5 visual density | #9 lessonScreen rowsOptional + tighter spacing (no SOT structural change) |
| `c3eceae` | fix5: architecture refactors | #12 StepDef.requiredSubFields hook, #13 their_in_moment_experience dedicated column, #16 REVIEW_FULL_CARD_DERIVATIONS named const block, #11 deferred with documented comment |
| `1447234` | fix6: round-trip test | #14 direct buildDerivedInsert + buildPayloadFields column-mapping tests |

Migration 0037 now adds **5 columns** (was 4 before fix1+fix5):
prepare.primary_emotion, prepare.default_pattern,
prepare.neutral_check_question, prepare.trigger_plan,
review.felt_at_hardest_moment, review.their_in_moment_experience.

## Phone QA after Vercel deploy

1. **Pulse Check** — Q9 title now reads "What would you need to observe over the next 3–7 days to know this is signal, not noise?"; Q8 title reads "What story are you telling yourself — and what's an alternative that would also fit?"; Q7 title reads "What might be going on for them right now that has nothing to do with you?". Page 1 now contains 5 Qs ending in `whenItShifted`; Page 2 starts with `feelingAndBody`. 7-chip routing matrix unchanged.
2. **Review Quick** — 2 pages; P1 = personName + whatHappened + observedInterpreted (3 Qs); P2 = whatYouDid + needsAndForecast (2 Qs). No `hardestMomentFeeling`. Forecast text persists.
3. **Review Full standalone** — P5 renders whatProtecting + lessonScreen (3 fields, first required) + whatElseExplains + whatReadMissed + needsAndForecast.
4. **Review Full calibration** — P5 renders whatProtecting + lessonScreen + 3 separate calibration Qs (compare/shift/floor) each with full step title + needsAndForecast. Forecast persists to `review_entries.forecast`; calibration combines into `review_entries.calibration_block` jsonb.
5. **Review Full repair** — picking apologize/reassure/clarify/ask_for_repair triggers the 3-page Repair branch with the new sharpened wording. `set_boundary` does NOT trigger Repair.
6. **Prepare** — 5 pages, 16 steps. P1 includes situation; P2 starts with primaryEmotionWithBody (text + body chip); opener on P5 is plain textarea (no body chip).
7. **AI outputs** — `prompt_version` stamped as 5.1.0 in payload_json; new rows stamp `aiVersionValue` 8 (Prepare) / 9 (Review).
8. **History** — historical entries from before the SOT follow-up continue to render (legacy columns kept nullable per CLAUDE.md feature-removal rule).

## Out of scope (preserved from 0036 prompt + reaffirmed here)

- Pre-flight timing gate, regulation gate, three-tier safety, drift detection
- Maintenance Check-in, check-back notifications
- Insights queries on new fields (separate work when an aggregator consumes them)
- Banned-phrase walker extension for shame-flagged Qs
- Body-chip skip path / power-imbalance dampener / Repair pre-guard

🤖 Generated with [Claude Code](https://claude.com/claude-code)
