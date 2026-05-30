-- Migration 0039: ai_card_edits — user edits / accept / reject of AI cards.
--
-- Slice A of the coins/redesign work (plan jiggly-scribbling-ripple.md §11).
-- AI cards become interactive: each card supports Accept / Edit / Not true.
-- When a user edits a card, the edited text becomes the version of record —
-- calibration, memory, and any future pattern surfacing read the edited value,
-- not the model's original guess.
--
-- This is the ONE user-writable AI table (the derived ai_*_json columns stay
-- model-written + read-only). It is intentionally additive: it touches no
-- existing table, so applying it cannot affect any current flow.
--
-- Polymorphic by design: (entry_table, entry_id) points at one of the five
-- Coach derived tables. v0 tradeoff — no hard FK on entry_id (a polymorphic
-- FK isn't expressible in one Postgres constraint). Integrity is enforced by
-- RLS (rows are user-scoped) + the app layer (it only writes valid pairs).
-- entry_table is CHECK-constrained to the known set so a typo can't land.
--
-- One row per (user, entry, card_key): the unique index makes the write an
-- idempotent upsert target — re-editing a card updates the same row rather
-- than stacking history. (If edit history is ever wanted, drop the unique
-- index and add a created_at-ordered read; not needed for v0.)

create table if not exists public.ai_card_edits (
  card_edit_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  entry_table text not null
    check (entry_table in (
      'prepare_entries',
      'review_entries',
      'before_you_send_entries',
      'pulse_check_entries',
      'repair_entries'
    )),
  entry_id uuid not null,
  card_key text not null,

  -- original_text: the model's value at edit time (kept for audit / "revert"
  -- and so analytics can compare model output vs. what the user judged true).
  original_text text,
  -- edited_text: the user's replacement. NULL when status = 'accepted' or
  -- 'not_true' (no replacement text); set when status = 'edited'.
  edited_text text,
  status text not null
    check (status in ('accepted', 'edited', 'not_true')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_card_edits_entry_idx
  on public.ai_card_edits (user_id, entry_table, entry_id);

-- One edit row per card. Upsert target on re-edit.
create unique index if not exists ai_card_edits_card_uniq
  on public.ai_card_edits (user_id, entry_table, entry_id, card_key);

alter table public.ai_card_edits enable row level security;

create policy "ai_card_edits_select_own" on public.ai_card_edits
  for select using (auth.uid() = user_id);
create policy "ai_card_edits_insert_own" on public.ai_card_edits
  for insert with check (auth.uid() = user_id);
create policy "ai_card_edits_update_own" on public.ai_card_edits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_card_edits_delete_own" on public.ai_card_edits
  for delete using (auth.uid() = user_id);
