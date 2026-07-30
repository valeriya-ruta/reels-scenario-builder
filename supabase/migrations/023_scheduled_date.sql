-- 023_scheduled_date.sql
-- Content calendar foundation (task 86d3d23nj): a per-piece `scheduled_date` so
-- content can be placed on the План month grid.
--
-- ⚠️ DB SCHEMA CHANGE — requires Kunj sign-off before applying to prod.
--
-- Adds a nullable `scheduled_date` (date, no time — the calendar is day-grained)
-- to every content-bearing table and surfaces it on the unified content_pieces
-- view so the plan page can read scheduled pieces in one query.

alter table public.carousel_projects add column if not exists scheduled_date date;
alter table public.projects add column if not exists scheduled_date date;
alter table public.storytelling_projects add column if not exists scheduled_date date;
alter table public.ideas add column if not exists scheduled_date date;

-- Index the common calendar read (per user, by scheduled day).
create index if not exists carousel_projects_scheduled_idx on public.carousel_projects (user_id, scheduled_date);
create index if not exists projects_scheduled_idx on public.projects (user_id, scheduled_date);
create index if not exists storytelling_projects_scheduled_idx on public.storytelling_projects (user_id, scheduled_date);
create index if not exists ideas_scheduled_idx on public.ideas (user_id, scheduled_date);

-- Recreate the unified view to carry scheduled_date. `scheduled_date` is
-- APPENDED at the end of each SELECT: CREATE OR REPLACE VIEW only permits adding
-- columns to the end, never reordering existing ones. (The app selects columns
-- by name, so view column order is irrelevant to it.)
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
    cp.updated_at,
    cp.scheduled_date
  from public.carousel_projects cp
  union all
  select p.id, p.user_id, 'reel', p.status, p.name, 'projects', p.created_at, p.updated_at, p.scheduled_date
  from public.projects p
  where p.project_type = 'reels'
  union all
  select s.id, s.user_id, 'story', s.status, s.name, 'storytelling_projects', s.created_at, s.updated_at, s.scheduled_date
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
    i.updated_at,
    i.scheduled_date
  from public.ideas i;

grant select on public.content_pieces to authenticated;
