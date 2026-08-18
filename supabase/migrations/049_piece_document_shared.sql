-- 049 — one definition of "a piece, written out", for both calendars.
--
-- 048 taught the SHARED calendar to hand back a whole reel. План — the owner's
-- own calendar — needs exactly the same document to show a piece beside the
-- month grid instead of navigating away from it. Copying the payload would be
-- the third hand-maintained copy of the reel's field list in this codebase, and
-- the previous two both silently fell behind the model.
--
-- So the document is defined ONCE, in `content_piece_document`, and both
-- entry points delegate to it:
--
--   calendar_share_piece(token, …)  → resolves the link's owner, then delegates
--   plan_piece_document(…)          → auth.uid() is the owner, then delegates
--
-- `content_piece_document` takes the owner as an ARGUMENT, so it must never be
-- callable by a client: passing someone else's uuid would read their content.
-- Execute is revoked from public/anon/authenticated; the two wrappers are
-- SECURITY DEFINER and therefore call it as the function owner.

create or replace function public.content_piece_document(
  p_owner uuid,
  p_ref_table text,
  p_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_result jsonb;
begin
  if p_owner is null then return null; end if;

  if p_ref_table = 'storytelling_projects' then
    select jsonb_build_object(
             'kind','story','id',s.id,'title',s.name,'status',s.status,
             'scheduledDate',s.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'text',st.text,'visual',st.visual,'engagement',st.engagement)
                      order by col.order_index, st.order_index)
               from public.storytelling_columns col
               join public.storytelling_stories st on st.column_id = col.id
               where col.project_id = s.id), '[]'::jsonb))
    into v_result
    from public.storytelling_projects s
    where s.id = p_id and s.user_id = p_owner;

  elsif p_ref_table = 'projects' then
    select jsonb_build_object(
             'kind','reel','id',p.id,'title',p.name,'status',p.status,
             'scheduledDate',p.scheduled_date,
             'overview', p.overview,
             'reelAudio', p.default_audio_source,
             'references', coalesce(p.reference_media, '[]'::jsonb),
             -- The table's own column names, so the browser parses these with
             -- `toReelBlock` rather than with a second, drifting parser.
             'blocks', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id',b.id,'project_id',b.project_id,'order_index',b.order_index,
                        'kind',b.kind,'speaker',b.speaker,'spoken',b.spoken,
                        'screen_text',b.screen_text,'record_note',b.record_note,
                        'asset_kind',b.asset_kind,'asset_note',b.asset_note,'asset_url',b.asset_url,
                        'edit_note',b.edit_note,'overlays',b.overlays,
                        'clips',b.clips,'images',b.images,
                        'audio_source',b.audio_source,'duration_sec',b.duration_sec)
                      order by b.order_index)
               from public.reel_blocks b where b.project_id = p.id), '[]'::jsonb))
    into v_result
    from public.projects p
    where p.id = p_id and p.user_id = p_owner;

  elsif p_ref_table = 'carousel_projects' then
    select jsonb_build_object(
             'kind','carousel','id',c.id,'title',c.name,'status',c.status,
             'scheduledDate',c.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'title',slide->>'title','body',slide->>'body',
                        'background',slide->>'backgroundColor',
                        'titleColor',slide->>'titleColor','bodyColor',slide->>'bodyColor')
                      order by t.ord)
               from jsonb_array_elements(
                      case when jsonb_typeof(c.slides)='array' then c.slides else '[]'::jsonb end
                    ) with ordinality as t(slide, ord)), '[]'::jsonb))
    into v_result
    from public.carousel_projects c
    where c.id = p_id and c.user_id = p_owner;
  end if;

  return v_result;
end; $function$;

revoke all on function public.content_piece_document(uuid, text, uuid) from public;
revoke all on function public.content_piece_document(uuid, text, uuid) from anon;
revoke all on function public.content_piece_document(uuid, text, uuid) from authenticated;

-- The client's calendar. Unchanged in what it lets through: a live token, the
-- link's owner, the link's blogger project, and a piece that is actually dated.
create or replace function public.calendar_share_piece(p_token text, p_ref_table text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_owner uuid; v_project uuid; v_ok boolean;
begin
  select l.owner_user_id, l.project_id into v_owner, v_project
  from public.calendar_share_links l
  where l.token = p_token and l.revoked = false;
  if v_owner is null then return null; end if;

  if p_ref_table = 'storytelling_projects' then
    select true into v_ok from public.storytelling_projects s
    where s.id = p_id and s.user_id = v_owner and s.scheduled_date is not null
      and s.project_id is not distinct from v_project;
  elsif p_ref_table = 'projects' then
    select true into v_ok from public.projects p
    where p.id = p_id and p.user_id = v_owner and p.scheduled_date is not null
      and p.project_type = 'reels'
      and p.project_id is not distinct from v_project;
  elsif p_ref_table = 'carousel_projects' then
    select true into v_ok from public.carousel_projects c
    where c.id = p_id and c.user_id = v_owner and c.scheduled_date is not null
      and c.project_id is not distinct from v_project;
  end if;

  if v_ok is not true then return null; end if;
  return public.content_piece_document(v_owner, p_ref_table, p_id);
end; $function$;

-- The owner's own calendar. No token, no date requirement — auth.uid() IS the
-- authorisation, and a signed-out caller gets null rather than an error.
create or replace function public.plan_piece_document(p_ref_table text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then return null; end if;
  return public.content_piece_document(auth.uid(), p_ref_table, p_id);
end; $function$;

revoke all on function public.plan_piece_document(text, uuid) from public;
revoke all on function public.plan_piece_document(text, uuid) from anon;
grant execute on function public.plan_piece_document(text, uuid) to authenticated;

notify pgrst, 'reload schema';
