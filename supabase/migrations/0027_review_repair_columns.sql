-- Migration 0027: review_entries — new base fields + repair-branch fields.
--
-- Coach redesign folds Repair into Review as a conditional sub-branch
-- (triggered by needs_to_happen_next ∈ {apologize, reassure, clarify,
-- ask_for_repair} + a self-reported readiness gate). The 3 repair-only
-- form fields (your_part, secret_want, could_make_them_feel) and the
-- 4 repair-only AI output fields (what_to_own, impact_on_them,
-- thing_not_to_say, recommended_timing — all live inside ai_reflection_json
-- as optional keys) are now part of one Review entry.
--
-- Strategy: add new nullable columns alongside existing ones. The legacy
-- form fields (what_helped, what_hurt, validated_assumptions,
-- unresolved_and_next) are no longer collected by the new Review form,
-- but stay in the table as nullable + COMMENT-ON-deprecated for /history
-- archive reads. A future cleanup migration drops them ~30 days post-launch.
--
-- pattern_tag mirrors the pattern in prepare_entries (migration 0026).

-- 1. New base fields (always written by new Review form).
alter table public.review_entries
  add column if not exists what_you_did text;
alter table public.review_entries
  add column if not exists what_you_avoided text;
alter table public.review_entries
  add column if not exists ask_before_understanding text;
alter table public.review_entries
  add column if not exists needs_to_happen_next text;
alter table public.review_entries
  add column if not exists pattern_tag text;

-- 2. CHECK on the two new enum-like fields. Both nullable (legacy rows)
-- and constrained when present.
alter table public.review_entries
  drop constraint if exists review_entries_ask_before_understanding_check;
alter table public.review_entries
  add constraint review_entries_ask_before_understanding_check
  check (ask_before_understanding is null
         or ask_before_understanding in ('yes', 'no', 'unclear'));

alter table public.review_entries
  drop constraint if exists review_entries_needs_to_happen_next_check;
alter table public.review_entries
  add constraint review_entries_needs_to_happen_next_check
  check (needs_to_happen_next is null
         or needs_to_happen_next in (
           'nothing', 'clarify', 'align', 'apologize',
           'reassure', 'give_space', 'set_boundary', 'ask_for_repair'
         ));

-- 3. Repair-branch fields (populated only when readiness gate yields
-- yes/somewhat AND needs_to_happen_next triggers repair).
alter table public.review_entries
  add column if not exists repair_branch_active boolean not null default false;
alter table public.review_entries
  add column if not exists your_part text;
alter table public.review_entries
  add column if not exists secret_want text;
alter table public.review_entries
  add column if not exists could_make_them_feel text;

-- 4. Document deprecated legacy fields. Kept for /history archive reads;
-- new Review writes leave them null.
comment on column public.review_entries.what_helped is
  'DEPRECATED 2026-04-23 (Coach redesign). New Review form does not collect this. Kept for /history archive reads.';
comment on column public.review_entries.what_hurt is
  'DEPRECATED 2026-04-23 (Coach redesign). New Review form does not collect this. Kept for /history archive reads.';
comment on column public.review_entries.validated_assumptions is
  'DEPRECATED 2026-04-23 (Coach redesign). Replaced by ask_before_understanding (enum). Kept for /history archive reads.';
comment on column public.review_entries.unresolved_and_next is
  'DEPRECATED 2026-04-23 (Coach redesign). Replaced by needs_to_happen_next (enum). Kept for /history archive reads.';
