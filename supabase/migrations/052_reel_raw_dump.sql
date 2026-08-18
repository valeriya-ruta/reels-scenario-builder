-- 052_reel_raw_dump.sql
-- What she actually said, kept, so «Зробити рілс» can be undone.
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- The bug this fixes destroyed real work. «Зробити рілс» rewrote the note IN
-- PLACE: it reused the existing block rows and overwrote `spoken`. A long
-- spoken dump — several minutes of argument, examples and asides — came back as
-- three short generic lines, and the original existed nowhere. Not in the
-- blocks (overwritten), not in `scenes` (frozen for reels), not anywhere else.
-- There was no undo because there was nothing left to undo from.
--
-- So the raw text is now written HERE first, before a single block is touched.
-- On the reel rather than on a block, because the dump is one text and the
-- rewrite changes how many blocks there are.
--
-- Additive and nullable: pro neither reads nor writes it.

alter table public.projects
  add column if not exists raw_dump text;

notify pgrst, 'reload schema';
