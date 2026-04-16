-- Add outcome_json JSONB columns to review_entries and repair_entries.
-- Stores inline outcome tracking responses (3-4 enum fields each).
-- No separate table needed — outcome is always 1:1 with the entry.

ALTER TABLE public.review_entries
  ADD COLUMN IF NOT EXISTS outcome_json JSONB;

ALTER TABLE public.repair_entries
  ADD COLUMN IF NOT EXISTS outcome_json JSONB;
