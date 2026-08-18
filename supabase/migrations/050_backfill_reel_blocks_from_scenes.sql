-- 050_backfill_reel_blocks_from_scenes.sql
-- Nobody's reel opens blank when the customer app starts reading blocks.
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- The customer edition is moving off `scenes` and onto `reel_blocks`, the table
-- the operator edition already reads. Migration 036 mirrored scenes into blocks
-- with a trigger and a catch-up pass, so in principle every reel already has
-- its text in both places.
--
-- Checked against the live database rather than assumed, on 2026-08-18:
--
--   84 customer reels; 0 would open blank; 59 carry text in both tables, and in
--   all 54 non-empty ones the block text is identical to the scene text
--   (whitespace aside). The only 5 reels where the two disagree belong to the
--   operator, and in every one the blocks were written AFTER the scenes — they
--   are Pro-side rewrites, so the blocks are the newer version and must win.
--
-- So this migration is expected to move zero rows today. It exists anyway,
-- because between writing this and applying it someone can create a reel down a
-- path 036's trigger does not cover, and "the backfill was a no-op" is a much
-- better thing to discover than a reel that opens empty. It is idempotent and
-- safe to run repeatedly.
--
-- Additive in both directions: `scenes` is only READ, never modified, so the
-- operator edition and every legacy reader see exactly what they saw before.

insert into public.reel_blocks
  (project_id, scene_id, order_index, kind, spoken, record_note, edit_note, created_at)
select
  s.project_id,
  s.id,
  s.order_index,
  'talk',
  s.lines,
  s.actor_note,
  s.editor_note,
  coalesce(s.created_at, now())
from public.scenes s
join public.projects p
  on p.id = s.project_id
 and p.project_type = 'reels'
where
  -- Something worth rescuing: an empty scene is not a loss.
  coalesce(trim(s.lines), '') <> ''
  -- Not already mirrored, by 036's trigger or by an earlier run of this.
  and not exists (
    select 1 from public.reel_blocks b where b.scene_id = s.id
  )
  -- And the reel has NO blocks at all.
  --
  -- Deliberately not "no blocks with text in them". Two of the operator's reels
  -- have blocks that are empty because she cleared them in the block editor
  -- yesterday, and an emptier rule resurrects the text she just deleted — as
  -- extra blocks, next to the empty ones she meant to keep. Once a reel has
  -- blocks, the block editor owns it and `scenes` is the stale copy; the only
  -- reel this migration may touch is one blocks never reached.
  and not exists (
    select 1 from public.reel_blocks b where b.project_id = s.project_id
  );

notify pgrst, 'reload schema';
