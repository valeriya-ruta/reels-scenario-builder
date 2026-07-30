-- 024_storytelling_status_track.sql
--
-- A storytelling is now ONE day's set of stories — its own project with its own
-- date and status — rather than a container holding many days. (Previously a
-- saga was one project with N day-columns, which meant a single date had to
-- stand for several days' worth of posting.)
--
-- Its lifecycle therefore becomes the same shape as the other content types:
--   idea (Ідея) -> script (Написання/Скрипт) -> ready (Готово) -> published
-- 'film' is retained in the CHECK so any existing rows on the old track stay
-- valid; nothing new is written at that stage.

alter table public.storytelling_projects drop constraint if exists storytelling_projects_status_chk;
alter table public.storytelling_projects
  add constraint storytelling_projects_status_chk
  check (status in ('idea','script','film','ready','published'));
