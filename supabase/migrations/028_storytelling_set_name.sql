-- 028_storytelling_set_name.sql
-- The storytelling BOARD gets a name of its own.
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- Why: the board's title was DERIVED from its days' names (the longest shared
-- stem). That made naming a two-way sync — renaming the board rewrote the first
-- column's name, and renaming the first column renamed the board — and a newly
-- added column was minted as «<board name> — день N», so an empty column arrived
-- already carrying the board's title (and therefore never auto-named itself from
-- what was written in it).
--
-- A set has no parent row to hold its title, so the title is denormalized onto
-- every row of the set — exactly like `set_size` (migration 025). Board rename
-- writes only this column; column rename writes only `name`. Neither touches the
-- other.
--
-- NULL means "never named as a board" → the UI falls back to the derived stem,
-- so existing sets keep the title they show today.

alter table public.storytelling_projects
  add column if not exists set_name text;

comment on column public.storytelling_projects.set_name is
  'Title of the multi-day board this storytelling belongs to. Denormalized onto every row of the set (same as set_size). NULL = derive from the days'' names.';
