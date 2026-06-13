-- 0052: condense persons.relationship_domain from 8 values to 5.
-- Founder decision 2026-06-13 (Prepare redesign). The eight domains
-- (partner, friend, family, manager, direct_report, coworker, client, other)
-- collapse to five:
--   romantic  — was partner
--   work      — absorbs manager, direct_report, coworker, client
--   friend / family / other — unchanged
-- relationship_domain lives on the shared persons table, so this is an
-- app-wide change, not Prepare-only: every consumer (person picker, People-tab
-- grouping, person history, monthly report, export) now maps over these five.

-- 1. Drop the old CHECK first so the data mapping can run (reused-column CHECK
--    lesson: widen/replace the constraint in the same migration as the new
--    values, never write first and hope).
alter table public.persons
  drop constraint if exists persons_relationship_domain_check;

-- 2. Remap existing rows. Idempotent: re-running matches nothing (the source
--    values no longer exist after the first pass).
update public.persons
  set relationship_domain = case relationship_domain
    when 'partner' then 'romantic'
    when 'manager' then 'work'
    when 'direct_report' then 'work'
    when 'coworker' then 'work'
    when 'client' then 'work'
    else relationship_domain
  end
  where relationship_domain in
    ('partner', 'manager', 'direct_report', 'coworker', 'client');

-- 3. Pre-flight defense before the new CHECK (constraint-migration lesson):
--    any unexpected legacy value becomes 'other' rather than aborting the
--    ALTER. No-op on a healthy DB.
update public.persons
  set relationship_domain = 'other'
  where relationship_domain not in ('romantic', 'friend', 'family', 'work', 'other');

-- 4. New CHECK.
alter table public.persons
  add constraint persons_relationship_domain_check
  check (relationship_domain in ('romantic', 'friend', 'family', 'work', 'other'));

notify pgrst, 'reload schema';
