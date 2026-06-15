-- 020_content_status_system.sql
-- Content status system (Status system 1/8 — task 86d3btm87).
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- Adds a per-piece `status` to every content-bearing table and exposes a single
-- unified `content_pieces` view that the "Твій контент" list reads from.
--
-- Status keys are stored in English for stability; the UI maps them to the
-- locked Ukrainian labels + palette in lib/content/statusSystem.ts:
--   idea      → Ідея        (#9A9A9A grey)
--   script    → Скрипт      (#004BA8 blue)
--   film      → Зняти       (#E8B81E yellow)
--   design    → Дизайн      (#E8B81E yellow)
--   edit      → Змонтувати  (#D97726 orange)
--   ready     → Готово      (#6FBF4A green)
--   published → Опубліковано(#1E6B3A dark green)
--
-- Per-type tracks (ordered, enforced in app code where the type is known):
--   reel:     idea → script → film → edit → ready → published
--   carousel: idea → script → design → ready → published
--   story:    idea → film → published
--   idea:     idea (no track until promoted to a real type)

-- 1. Status columns. Everything a user starts begins at `idea` (grey).
alter table public.carousel_projects
  add column if not exists status text not null default 'idea';
alter table public.projects
  add column if not exists status text not null default 'idea';
alter table public.storytelling_projects
  add column if not exists status text not null default 'idea';
alter table public.ideas
  add column if not exists status text not null default 'idea',
  -- A braindump idea HAS content but no type yet → content_type = 'idea'.
  -- Promoting it sets content_type to the chosen type (see auto-save task).
  add column if not exists content_type text not null default 'idea';

-- 2. Track validity enforced at the DB: each content table only accepts the
-- statuses on ITS type's track (drop-then-add keeps this re-runnable). `ideas`
-- is the flexible one — a braindump idea (content_type='idea') sits at 'idea',
-- and once promoted (content_type=reel/carousel/story) it carries that track's
-- statuses, so it allows all 7.
alter table public.carousel_projects drop constraint if exists carousel_projects_status_chk;
alter table public.carousel_projects
  add constraint carousel_projects_status_chk
  check (status in ('idea','script','design','ready','published'));

alter table public.projects drop constraint if exists projects_status_chk;
alter table public.projects
  add constraint projects_status_chk
  check (status in ('idea','script','film','edit','ready','published'));

alter table public.storytelling_projects drop constraint if exists storytelling_projects_status_chk;
alter table public.storytelling_projects
  add constraint storytelling_projects_status_chk
  check (status in ('idea','film','published'));

alter table public.ideas drop constraint if exists ideas_status_chk;
alter table public.ideas
  add constraint ideas_status_chk
  check (status in ('idea','script','film','design','edit','ready','published'));

alter table public.ideas drop constraint if exists ideas_content_type_chk;
alter table public.ideas
  add constraint ideas_content_type_chk
  check (content_type in ('idea','reel','carousel','story'));

-- Index the common read path (per-user, most-recent-first).
create index if not exists carousel_projects_user_updated_idx on public.carousel_projects (user_id, updated_at desc);
create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);
create index if not exists storytelling_projects_user_updated_idx on public.storytelling_projects (user_id, updated_at desc);
create index if not exists ideas_user_updated_idx on public.ideas (user_id, updated_at desc);

-- 3. Unified "all content for this user" read. security_invoker keeps each
-- underlying table's RLS in force, so a user only ever sees their own rows.
create or replace view public.content_pieces
with (security_invoker = on) as
  select
    cp.id,
    cp.user_id,
    'carousel'::text          as content_type,
    cp.status,
    cp.name                   as title,
    'carousel_projects'::text as ref_table,
    cp.created_at,
    cp.updated_at
  from public.carousel_projects cp
  union all
  select p.id, p.user_id, 'reel', p.status, p.name, 'projects', p.created_at, p.updated_at
  from public.projects p
  where p.project_type = 'reels'
  union all
  select s.id, s.user_id, 'story', s.status, s.name, 'storytelling_projects', s.created_at, s.updated_at
  from public.storytelling_projects s
  union all
  select
    i.id,
    i.user_id,
    i.content_type,
    i.status,
    coalesce(nullif(i.title, ''), left(i.content, 80)) as title,
    'ideas',
    i.created_at,
    i.updated_at
  from public.ideas i;

grant select on public.content_pieces to authenticated;
