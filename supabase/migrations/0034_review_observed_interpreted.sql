-- Migration 0034: review_entries — observed/interpreted two-column fields.
--
-- Cross-eval batch #1 (2026-05-03) — adds the two-column "What did you
-- observe? / What did you think it meant?" step on Review. The form-factor
-- itself trains the observed/interpreted split that 25-persona evaluation
-- showed Tier 2 / anxious users skipping when both reads collapsed into
-- a single `whatHappened` field.
--
-- Both columns nullable: pre-2026-05-03 review_entries rows have neither
-- value, and we keep them readable on /history without a backfill. New
-- form writes both as non-empty strings (Zod min(1).max(2000) enforces
-- this on the input side).
--
-- `observed_in_them` is now redundant (the new step covers what was on
-- the other person). Flagged for follow-up cleanup ticket; not dropped
-- here because legacy rows still read it.

alter table public.review_entries
  add column if not exists observed_raw text;
alter table public.review_entries
  add column if not exists interpreted_raw text;
