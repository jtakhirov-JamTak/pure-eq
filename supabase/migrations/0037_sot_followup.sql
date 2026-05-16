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

comment on column public.prepare_entries.primary_emotion is
  'SOT 2026-05-08 follow-up. The emotion the user is carrying into the conversation. Paired with body_location which stores where it sits in the body. Replaces opener-attached body chip semantic from 0036.';
comment on column public.prepare_entries.default_pattern is
  'SOT 2026-05-08 follow-up. The user''s default behavior under that emotion (the move that usually gets in the way). Feeds buildPreparePrompt + triggerPlan if-then template.';
comment on column public.prepare_entries.neutral_check_question is
  'SOT 2026-05-08 follow-up. One neutral question the user can ask to check their read instead of assuming. Not "are we okay" — something specific that would actually surface info.';
