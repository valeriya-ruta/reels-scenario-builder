-- 032_calendar_share_scope_to_blogger.sql
-- A share link belongs to ONE blogger, not to the whole account.
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- The bug: `calendar_share_pieces` / `calendar_share_piece` (migration 029)
-- filtered on `user_id = <link owner>` and nothing else. Under Ruta Pro one
-- operator account holds SEVERAL bloggers, separated by `project_id` — every
-- other surface scopes by it (see lib/pro/scope.ts, `applyScope`), and the share
-- functions were the one read path that did not. So a link made to show one
-- blogger's plan showed the operator's ENTIRE account: one client could read
-- another client's unpublished content.
--
-- The fix is the scope the rest of the app already uses:
--
--   link.project_id IS NOT NULL  →  only that blogger's content
--   link.project_id IS NULL      →  only content that belongs to no blogger
--
-- The NULL branch is what makes this safe by default rather than safe once
-- configured. A link created before this migration has a NULL project_id, so
-- from the moment this runs it shows personal content only — it can no longer
-- serve any blogger's rows, including the one it was meant for. (The link for
-- «Віра Шако» is re-pointed at her project right after this, so it keeps
-- working.) It is also exactly right for the customer edition, where nobody has
-- bloggers and every content row carries project_id = NULL.

alter table public.calendar_share_links
  add column if not exists project_id uuid references public.pro_projects(id) on delete cascade;

comment on column public.calendar_share_links.project_id is
  'The blogger (pro_projects row) this link shows. NULL = content that belongs to no blogger (customer edition, or the operator''s own).';

create index if not exists idx_calendar_share_links_project on public.calendar_share_links (project_id);

-- ── The month, scoped to the link's blogger ─────────────────────────────────
create or replace function public.calendar_share_pieces(p_token text)
returns table (
  id             uuid,
  content_type   text,
  status         text,
  title          text,
  ref_table      text,
  scheduled_date date,
  set_index      integer,
  set_size       integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_project uuid;
begin
  select l.owner_user_id, l.project_id into v_owner, v_project
  from public.calendar_share_links l
  where l.token = p_token and l.revoked = false;

  if v_owner is null then
    return;
  end if;

  return query
    select c.id, 'carousel'::text, c.status, c.name, 'carousel_projects'::text,
           c.scheduled_date, null::integer, null::integer
    from public.carousel_projects c
    where c.user_id = v_owner and c.scheduled_date is not null
      and c.project_id is not distinct from v_project
    union all
    select p.id, 'reel'::text, p.status, p.name, 'projects'::text,
           p.scheduled_date, null::integer, null::integer
    from public.projects p
    where p.user_id = v_owner and p.scheduled_date is not null and p.project_type = 'reels'
      and p.project_id is not distinct from v_project
    union all
    select s.id, 'story'::text, s.status, s.name, 'storytelling_projects'::text,
           s.scheduled_date, s.set_index, s.set_size
    from public.storytelling_projects s
    where s.user_id = v_owner and s.scheduled_date is not null
      and s.project_id is not distinct from v_project;
end;
$$;

-- ── One piece, same scope ───────────────────────────────────────────────────
-- `is not distinct from` rather than `=` so the NULL case compares as equality
-- instead of collapsing to NULL (which would silently return nothing, or worse,
-- pass a row through if it were written the other way round).
create or replace function public.calendar_share_piece(
  p_token     text,
  p_ref_table text,
  p_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_project uuid;
  v_result  jsonb;
begin
  select l.owner_user_id, l.project_id into v_owner, v_project
  from public.calendar_share_links l
  where l.token = p_token and l.revoked = false;

  if v_owner is null then
    return null;
  end if;

  if p_ref_table = 'storytelling_projects' then
    select jsonb_build_object(
             'kind', 'story',
             'id', s.id,
             'title', s.name,
             'status', s.status,
             'scheduledDate', s.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(
                        jsonb_build_object(
                          'text', st.text,
                          'visual', st.visual,
                          'engagement', st.engagement
                        )
                        order by col.order_index, st.order_index
                      )
               from public.storytelling_columns col
               join public.storytelling_stories st on st.column_id = col.id
               where col.project_id = s.id
             ), '[]'::jsonb)
           )
    into v_result
    from public.storytelling_projects s
    where s.id = p_id and s.user_id = v_owner and s.scheduled_date is not null
      and s.project_id is not distinct from v_project;

  elsif p_ref_table = 'projects' then
    select jsonb_build_object(
             'kind', 'reel',
             'id', p.id,
             'title', p.name,
             'status', p.status,
             'scheduledDate', p.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(
                        jsonb_build_object(
                          'name', sc.name,
                          'lines', sc.lines,
                          'framing', sc.framing,
                          'shotSize', sc.shot_size,
                          'actorNote', sc.actor_note
                        )
                        order by sc.order_index
                      )
               from public.scenes sc
               where sc.project_id = p.id
             ), '[]'::jsonb)
           )
    into v_result
    from public.projects p
    where p.id = p_id and p.user_id = v_owner and p.scheduled_date is not null
      and p.project_id is not distinct from v_project;

  elsif p_ref_table = 'carousel_projects' then
    select jsonb_build_object(
             'kind', 'carousel',
             'id', c.id,
             'title', c.name,
             'status', c.status,
             'scheduledDate', c.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(
                        jsonb_build_object(
                          'title', slide->>'title',
                          'body', slide->>'body',
                          'background', slide->>'backgroundColor',
                          'titleColor', slide->>'titleColor',
                          'bodyColor', slide->>'bodyColor'
                        )
                        order by t.ord
                      )
               from jsonb_array_elements(
                      case when jsonb_typeof(c.slides) = 'array' then c.slides else '[]'::jsonb end
                    ) with ordinality as t(slide, ord)
             ), '[]'::jsonb)
           )
    into v_result
    from public.carousel_projects c
    where c.id = p_id and c.user_id = v_owner and c.scheduled_date is not null
      and c.project_id is not distinct from v_project;
  end if;

  return v_result;
end;
$$;

grant execute on function public.calendar_share_pieces(text) to anon, authenticated;
grant execute on function public.calendar_share_piece(text, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
