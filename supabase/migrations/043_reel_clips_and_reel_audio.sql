-- 043: a cutaway block holds MANY shots, and a reel has its own sound.
--
-- Two things the builder could not say.
--
-- 1. «Відео, відео, відео, кожне зі своїм написом» is one beat of a reel, not
--    eight. It was eight blocks, which buries the script in boilerplate and
--    makes reordering the sequence a chore. `clips` holds the shots inside one
--    block: what happens, what is written over it, what is heard over it.
--    JSONB rather than a table for the same reason `overlays` is: they are
--    small, ordered, always read with their block and never queried alone.
--
-- 2. A trend is usually a property of the REEL. Setting it on every block one
--    at a time is tedious, and it is why the edit list repeated «трендовий
--    звук» on every line — eight identical cues where there is one. The block
--    keeps its own override; `default_audio_source` is what it falls back to.
alter table public.reel_blocks add column if not exists clips jsonb not null default '[]'::jsonb;

alter table public.projects add column if not exists default_audio_source text;
alter table public.projects drop constraint if exists projects_default_audio_source_check;
alter table public.projects
  add constraint projects_default_audio_source_check
  check (default_audio_source is null
         or default_audio_source in ('sync','voiceover','trend','mute'));

-- The client's page derives its lists from exactly the same fields the builder
-- does, so both have to travel through the share view.
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
