-- 0051: overwhelmed_entries.person_id — the Overwhelmed tool gains an
-- optional "who was this about?" step (founder direction 2026-06-12; the
-- Triggered tool's trigger_entries has carried the column since 0033).
-- Same FK shape as every other person link: nullable, on delete set null.
alter table public.overwhelmed_entries
  add column if not exists person_id uuid
    references public.persons(person_id) on delete set null;

notify pgrst, 'reload schema';
