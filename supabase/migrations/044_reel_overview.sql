-- 044: a reel gets a brief — what it is, in the author's own words.
--
-- The storyboard says what happens beat by beat, which is precise and still not
-- the same as knowing what the reel IS. For a purely edited video — clips, text
-- on screen, no talking — nothing on the page carried the idea at all: the
-- person opening the link got a sequence of shots and had to infer the point.
--
-- Written once per reel, shown first on the share.
alter table public.projects add column if not exists overview text;

-- The client's page has to receive it, so it travels with the reel.
create or replace function public.reel_share_view(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
           'title', l.title,
           'note',  l.note,
           'reels', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', p.id,
                      'title', p.name,
                      'scheduledDate', p.scheduled_date,
                      'defaultAudio', p.default_audio_source,
                      'overview', p.overview,
                      'blocks', coalesce((
                        select jsonb_agg(jsonb_build_object(
                                 'id', b.id, 'project_id', b.project_id,
                                 'order_index', b.order_index, 'kind', b.kind,
                                 'speaker', b.speaker, 'spoken', b.spoken,
                                 'screen_text', b.screen_text, 'record_note', b.record_note,
                                 'asset_kind', b.asset_kind, 'asset_note', b.asset_note,
                                 'asset_url', b.asset_url, 'edit_note', b.edit_note,
                                 'overlays', b.overlays, 'clips', b.clips,
                                 'audio_source', b.audio_source,
                                 'duration_sec', b.duration_sec)
                               order by b.order_index)
                        from public.reel_blocks b where b.project_id = p.id), '[]'::jsonb))
                    order by i.order_index)
             from public.reel_share_items i
             join public.projects p on p.id = i.reel_id and p.user_id = l.owner_user_id
             where i.link_id = l.id), '[]'::jsonb))
  from public.reel_share_links l
  where l.token = p_token and l.revoked = false;
$$;

grant execute on function public.reel_share_view(text) to anon, authenticated;

notify pgrst, 'reload schema';
