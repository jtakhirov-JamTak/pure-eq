-- Migration 0037: SOT follow-up — columns missed by 0036.
--
-- The locked Coach SOT (25-persona cross-eval, 2026-05-06) specified
-- several Prepare and Review fields that did not make it into 0036's
-- column adds. This migration fills the gap.
--
-- Commit 4 of feat/sot-followup-0037: prepare_entries.primary_emotion +
-- default_pattern + neutral_check_question.
--
-- Commit 5 of the same PR extends this file with review_entries.felt_at_
-- hardest_moment when the SOT Review Full overhaul lands. Founder applies
-- once via Supabase SQL Editor after the PR merges.
--
-- All adds are nullable + idempotent. No CHECK changes. body_location on
-- prepare_entries (added in 0036) is re-purposed semantically: it was the
-- opener's body chip; SOT moves the body chip OFF opener TO primary_emotion.
-- The column stays — only the consumer changes. Legacy rows keep their
-- meaning (the opener's body, which made it into AI prompts as "felt sense
-- going in" — close enough to the new semantics for /history reads).

-- ============================================================
-- 1. prepare_entries: 3 new SOT columns (Commit 4)
-- ============================================================
alter table public.prepare_entries
  add column if not exists primary_emotion text;
alter table public.prepare_entries
  add column if not exists default_pattern text;
alter table public.prepare_entries
  add column if not exists neutral_check_question text;
alter table public.prepare_entries
  add column if not exists trigger_plan text;

comment on column public.prepare_entries.primary_emotion is
  'SOT 2026-05-08 follow-up. The emotion the user is carrying into the conversation. Paired with body_location which stores where it sits in the body. Replaces opener-attached body chip semantic from 0036.';
comment on column public.prepare_entries.default_pattern is
  'SOT 2026-05-08 follow-up. The user''s default behavior under that emotion (the move that usually gets in the way). Feeds buildPreparePrompt + triggerPlan if-then template.';
comment on column public.prepare_entries.neutral_check_question is
  'SOT 2026-05-08 follow-up. One neutral question the user can ask to check their read instead of assuming. Not "are we okay" — something specific that would actually surface info.';
comment on column public.prepare_entries.trigger_plan is
  'SOT 2026-05-08 follow-up fix1. If-then implementation intention the user authored ("If I notice myself feeling X, then I will Y"). Surfaces in AI prompt + /history. Previously kept only in raw_records.payload_json, which made the field invisible to /history readers.';

-- ============================================================
-- 2. review_entries: felt_at_hardest_moment (Commit 5)
-- ============================================================
-- The 0036 migration mapped hardest_moment_feeling → feeling_tracking +
-- body_location as a rename. But the locked SOT treats them as TWO
-- distinct Qs:
--   feltAtHardestMoment — "What did you feel at the hardest moment, and
--     where in your body?"  (text + body chip pairing)
--   feelingTracking — "Was the feeling tracking something real?"
--     (was it signal, or noise the reasoning hadn't surfaced yet)
-- So feeling_tracking gets reframed (the column comment in 0036 said
-- "rename"; that interpretation is wrong) and felt_at_hardest_moment
-- becomes a new column. body_location was already added on review_entries
-- in 0036 — it pairs with felt_at_hardest_moment.

alter table public.review_entries
  add column if not exists felt_at_hardest_moment text;
-- SOT 2026-05-08 fix5 (#13): dedicated column for theirInMomentExperience
-- instead of re-purposing the 0036-deprecated their_experience column. The
-- "un-deprecate" approach (writing new SOT semantics to a column whose
-- 0036 comment said "deprecated") was a /history-readability bomb — readers
-- in 6 months couldn't tell pre-0036 rows (real their_experience semantic)
-- from post-fix5 rows (theirInMomentExperience semantic). Now they're
-- distinct columns with unambiguous comments.
alter table public.review_entries
  add column if not exists their_in_moment_experience text;

comment on column public.review_entries.felt_at_hardest_moment is
  'SOT 2026-05-08 follow-up. What the user felt at the hardest moment, paired with review_entries.body_location for the body chip. The legacy hardest_moment_feeling column stays nullable for /history reads; new posts write here.';
comment on column public.review_entries.their_in_moment_experience is
  'SOT 2026-05-08 follow-up fix5 (#13). What it might have felt like for the other person in that moment. SOT Page 4 Q. Distinct from the deprecated their_experience column (0036 had a wrong "replaced by lesson_about_them" mapping).';

-- Revise the deprecation comment 0036 wrote on hardest_moment_feeling —
-- the "replaced by feeling_tracking" mapping was wrong; SOT treats
-- feeling_tracking as a separate Q.
comment on column public.review_entries.hardest_moment_feeling is
  'DEPRECATED 2026-05-08 (Coach SOT follow-up). Replaced by felt_at_hardest_moment + body_location. 0036''s "replaced by feeling_tracking" mapping was a mis-read of the SOT — feeling_tracking is a separate Q ("Was the feeling tracking something real?"). Kept nullable for legacy /history reads.';

-- their_experience: re-clarify it''s deprecated again. fix5 (#13) introduces
-- a dedicated their_in_moment_experience column rather than re-purposing
-- this one. This column predates the SOT entirely and historical rows have
-- their own pre-SOT semantics.
comment on column public.review_entries.their_experience is
  'DEPRECATED 2026-05-08 (Coach SOT follow-up fix5). Pre-SOT semantic only — historical /history reads. New SOT writes go to their_in_moment_experience.';

comment on column public.review_entries.feeling_tracking is
  'SOT 2026-05-08 follow-up. "Was the feeling tracking something real?" — was the felt experience signal pointing at something the user''s reasoning hadn''t surfaced yet, or noise. NOT a rename of hardest_moment_feeling (see felt_at_hardest_moment for that).';
