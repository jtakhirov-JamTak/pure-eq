-- Add observation_source column to distinguish predictive vs observed patterns.
-- Predictive (from Prepare) are stored for analysis but excluded from
-- user-facing insight thresholds. Observed (from Review, Trigger) count
-- toward recurring blind spot detection.
ALTER TABLE public.pattern_observations
  ADD COLUMN IF NOT EXISTS observation_source text
  NOT NULL DEFAULT 'observed'
  CHECK (observation_source IN ('observed', 'predictive'));
