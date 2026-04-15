-- Pure EQ domain — replace in fork.
-- Pure EQ v0 — post-review hardening.
-- Belt-and-suspenders constraints caught by the /full-review pipeline.
-- Safe to re-run: each statement is idempotent (DROP then ADD).
-- Apply manually in the Supabase dashboard SQL Editor or via CLI.

-- ============================================================
-- user_profiles.primary_profile — constrain to the 6 known values
-- so a scoring bug can never persist "undefined" or a typo.
-- ============================================================
alter table public.user_profiles
  drop constraint if exists user_profiles_primary_profile_check;

alter table public.user_profiles
  add constraint user_profiles_primary_profile_check
  check (
    primary_profile in (
      'direct','reflective','warm','measured','perceptive','intense'
    )
  );

-- Same constraint on secondary_profile (nullable — null is allowed).
alter table public.user_profiles
  drop constraint if exists user_profiles_secondary_profile_check;

alter table public.user_profiles
  add constraint user_profiles_secondary_profile_check
  check (
    secondary_profile is null
    or secondary_profile in (
      'direct','reflective','warm','measured','perceptive','intense'
    )
  );
