-- 045: pictures pasted straight into a block.
--
-- A reference picture is how you say «отак має виглядати кадр» in one gesture.
-- Asking for a file picker and a saved file first is enough friction that the
-- picture never gets attached at all — the useful move is Ctrl+V from wherever
-- it was found.
--
-- Stored in `reel_blocks.images` as [{id, url, note?}]: same reasoning as
-- `overlays` and `clips` — small, ordered, always read with their block.
alter table public.reel_blocks add column if not exists images jsonb not null default '[]'::jsonb;

-- The bucket the pasted files land in.
--
-- Public read, because the person shooting opens the share link with no account
-- at all and still has to see the picture. That is the same exposure the share
-- link itself has: anyone holding the URL can look. Writes are another matter —
-- they are restricted below to the owner's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reel-refs', 'reel-refs', true, 10485760,
  array['image/png','image/jpeg','image/gif','image/webp','image/avif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/png','image/jpeg','image/gif','image/webp','image/avif'];

-- Path is `<user-id>/<reel-id>/<file>`, so the first segment is the owner and a
-- policy can check it. Anyone signed in may write under their OWN id and no
-- one else's.
drop policy if exists "reel refs are readable by anyone" on storage.objects;
create policy "reel refs are readable by anyone" on storage.objects for select
  using (bucket_id = 'reel-refs');

drop policy if exists "own folder insert" on storage.objects;
create policy "own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'reel-refs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "own folder update" on storage.objects;
create policy "own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'reel-refs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "own folder delete" on storage.objects;
create policy "own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'reel-refs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Pictures have to reach the client's page like every other part of a block.
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
