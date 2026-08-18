-- 047: references belong to the REEL, not only to a block.
--
-- 045 put pasted pictures and links on blocks, which is right for «отак має
-- виглядати оцей кадр». But the common case is a reference for the whole
-- thing — the reel this one is modelled on, the mood, two screenshots of what
-- it should feel like — and that has no block to hang off. It belongs with the
-- brief, and it is the first thing the person editing should see.
--
-- `[{id, url, note?}]`, same shape as reel_blocks.images: a reference is a URL
-- whichever way it arrived, and the page decides how to show it.
alter table public.projects add column if not exists reference_media jsonb not null default '[]'::jsonb;

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
                      'references', p.reference_media,
                      'blocks', coalesce((
                        select jsonb_agg(jsonb_build_object(
                                 'id', b.id, 'project_id', b.project_id,
                                 'order_index', b.order_index, 'kind', b.kind,
                                 'speaker', b.speaker, 'spoken', b.spoken,
                                 'screen_text', b.screen_text, 'record_note', b.record_note,
                                 'asset_kind', b.asset_kind, 'asset_note', b.asset_note,
                                 'asset_url', b.asset_url, 'edit_note', b.edit_note,
                                 'overlays', b.overlays, 'clips', b.clips,
                                 'images', b.images,
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
