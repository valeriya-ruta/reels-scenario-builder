-- 051_reel_caption.sql
-- The words UNDER the reel, which are not the words in it.
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- The script is what she says to camera; the caption is read silently, often by
-- someone watching without sound. They are two different texts for two
-- different readers, and until now there was nowhere to keep the second one —
-- so it got written in Instagram, at the moment of posting, which is the worst
-- possible time to think about it.
--
-- Additive: a nullable column on `projects`. Nothing reads it but the customer
-- app, and `reference_note` / `overview` (the operator edition's brief) are
-- deliberately left alone rather than reused — a brief for an editor and a
-- caption for an audience are not the same field, and sharing one would put
-- pro's text under her post.

alter table public.projects
  add column if not exists caption text;

notify pgrst, 'reload schema';
