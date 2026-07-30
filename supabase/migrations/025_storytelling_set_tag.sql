-- 025_storytelling_set_tag.sql
--
-- Multi-day storytellings generated from one braindump are SIBLINGS, not
-- children of a container: each keeps its own date and its own status. (A parent
-- object would need a date of its own, which is exactly the problem we removed
-- in 024.) This is only a tag saying "these were born together", so the UI can
-- render 1/3, 2/3, 3/3 and offer jump-to-sibling navigation.
--
-- Applied to prod (ohhudfwwdcbpxryxmvmd).

alter table public.storytelling_projects
  add column if not exists set_id uuid,
  add column if not exists set_index integer,
  add column if not exists set_size integer;

create index if not exists storytelling_projects_set_idx
  on public.storytelling_projects (set_id);

-- Surface the set tag on the unified content read. Columns are APPENDED at the
-- end: CREATE OR REPLACE VIEW can only add columns, never reorder them.
create or replace view public.content_pieces
with (security_invoker = on) as
  select
    cp.id, cp.user_id, 'carousel'::text as content_type, cp.status,
    cp.name as title, 'carousel_projects'::text as ref_table,
    cp.created_at, cp.updated_at, cp.scheduled_date,
    null::integer as set_index, null::integer as set_size
  from public.carousel_projects cp
  union all
  select p.id, p.user_id, 'reel', p.status, p.name, 'projects',
    p.created_at, p.updated_at, p.scheduled_date,
    null::integer, null::integer
  from public.projects p
  where p.project_type = 'reels'
  union all
  select s.id, s.user_id, 'story', s.status, s.name, 'storytelling_projects',
    s.created_at, s.updated_at, s.scheduled_date,
    s.set_index, s.set_size
  from public.storytelling_projects s
  union all
  select
    i.id, i.user_id, i.content_type, i.status,
    coalesce(nullif(i.title, ''), left(i.content, 80)) as title,
    'ideas', i.created_at, i.updated_at, i.scheduled_date,
    null::integer, null::integer
  from public.ideas i;

grant select on public.content_pieces to authenticated;
