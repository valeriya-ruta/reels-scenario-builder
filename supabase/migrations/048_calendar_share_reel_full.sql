-- 048 — the shared calendar hands back a WHOLE reel, not a summary of one.
--
-- `calendar_share_piece` was written before clips (043), reel-wide sound (043),
-- the brief (044) and references (047). It selected the block's own columns and
-- nothing else, so a modern cutaway — whose every word lives in `clips` — came
-- back as «Відео / нарізка · Ще не написано · Трендовий звук». The client could
-- see that a reel existed on the 19th and nothing about what it was.
--
-- Two changes, both about not paraphrasing the reel here:
--
--   1. The block objects now use the SAME key names as the table's columns, so
--      the browser parses them with `toReelBlock` — the one parser the builder
--      and the reel share already use. A field added to the model can no longer
--      be forgotten by this reader (the bug that lost the clips once already).
--   2. The reel carries its own overview, default sound and references, so the
--      calendar can render the same page the reel share link does.
--
-- Story and carousel branches are unchanged.
--
-- Security is untouched: still SECURITY DEFINER keyed on a live token, still
-- scoped to the link's owner and blogger project, still no anon read policy on
-- any of the underlying tables.

create or replace function public.calendar_share_piece(p_token text, p_ref_table text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_owner uuid; v_project uuid; v_result jsonb;
begin
  select l.owner_user_id, l.project_id into v_owner, v_project
  from public.calendar_share_links l
  where l.token = p_token and l.revoked = false;
  if v_owner is null then return null; end if;

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
    where s.id = p_id and s.user_id = v_owner and s.scheduled_date is not null
      and s.project_id is not distinct from v_project;

  elsif p_ref_table = 'projects' then
    select jsonb_build_object(
             'kind','reel','id',p.id,'title',p.name,'status',p.status,
             'scheduledDate',p.scheduled_date,
             -- The reel as a whole: what it is, what it sounds like, what it
             -- is modelled on. Read before any of the beats.
             'overview', p.overview,
             'reelAudio', p.default_audio_source,
             'references', coalesce(p.reference_media, '[]'::jsonb),
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
    where p.id = p_id and p.user_id = v_owner and p.scheduled_date is not null
      and p.project_id is not distinct from v_project;

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
    where c.id = p_id and c.user_id = v_owner and c.scheduled_date is not null
      and c.project_id is not distinct from v_project;
  end if;

  return v_result;
end; $function$;

notify pgrst, 'reload schema';
