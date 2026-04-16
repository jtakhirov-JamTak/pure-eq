-- Pure EQ domain — replace in fork.
-- Add missing columns for Tools tab flows (Overwhelmed + Triggered).
-- All nullable so existing rows stay valid.

-- ============================================================
-- trigger_entries — add emotion_intensity, urge_intensity, after_feeling
-- ============================================================
alter table public.trigger_entries
  add column if not exists emotion_intensity smallint
    check (emotion_intensity between 1 and 10);

alter table public.trigger_entries
  add column if not exists urge_intensity smallint
    check (urge_intensity between 1 and 10);

alter table public.trigger_entries
  add column if not exists after_feeling text;

-- ============================================================
-- overwhelmed_entries — add after_feeling
-- ============================================================
alter table public.overwhelmed_entries
  add column if not exists after_feeling text;
