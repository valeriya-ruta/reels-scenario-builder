-- 034_reel_blocks_audio_source.sql
-- A block's PICTURE and its SOUND are separate questions.
--
-- «B-roll із тим самим звуком зверху» is the case that forced this: the picture
-- cuts away to a clip while the voice from the previous take keeps running. An
-- editor cannot infer that — muting the cutaway and continuing the voice over it
-- are different edits, and only the author knows which was meant.
--
--   sync      звук із цього кадру (людина говорить у кадрі)
--   voiceover голос продовжується поверх цієї картинки
--   trend     трендовий звук зверху
--   mute      без звуку
alter table public.reel_blocks
  add column if not exists audio_source text
  check (audio_source in ('sync','voiceover','trend','mute'));

comment on column public.reel_blocks.audio_source is
  'Where this block''s sound comes from. NULL = obvious from the kind (talk/dialogue = sync).';

notify pgrst, 'reload schema';
