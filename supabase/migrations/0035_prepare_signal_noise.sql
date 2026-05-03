-- Migration 0035: prepare_entries — Path B signal/noise observation field.
--
-- Cross-eval batch #1 (2026-05-03) — adds the 3–7 day signal/noise step
-- to Path B ("Something feels off"). The user names a falsifiable
-- observation BEFORE the AI's best_next_move, so subsequent reviews can
-- distinguish actual signal from rumination amplification.
--
-- Nullable: pre-2026-05-03 Path B rows (and all Path A rows) have no
-- value here. Enforced as min(1).max(1000) on the input side via Zod.
-- A follow-up ticket will read this column to schedule a check-back
-- notification 3–7 days after submission.

alter table public.prepare_entries
  add column if not exists signal_noise_observation text;
