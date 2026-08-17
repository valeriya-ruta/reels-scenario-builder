-- 035_reel_share_links.sql
-- Share ONE reel with the person who has to record it.
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- The calendar link (029) answers "what is planned this month". This answers
-- "here is the reel we're shooting" — what you send when there is nothing to
-- plan, only something to film.
--
-- Same security shape as 029/032: NO anon read policy on the table. A policy
-- cannot see a token, so the only policy that would work reads "anyone may read
-- active links" — which hands every user's token to whoever queries it. The
-- function takes the token as an ARGUMENT instead.

create table if not exists public.reel_share_links (
  id            uuid primary key default gen_random_uuid(),
  reel_id       uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  token         text not null unique,
  note          text,
  revoked       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_reel_share_links_token on public.reel_share_links (token);
create index if not exists idx_reel_share_links_reel on public.reel_share_links (reel_id);

alter table public.reel_share_links enable row level security;

drop policy if exists "owner manages own reel links" on public.reel_share_links;
create policy "owner manages own reel links" on public.reel_share_links
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- The whole reel behind a token, emitted under the database's own column names
-- so the app maps it with the same `toReelBlock` the builder uses — one parser,
-- one shape, no drift. Joined back to `projects` on user_id so a link can never
-- outlive its reel or point at someone else's.
create or replace function public.reel_share_view(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
           'title', p.name,
           'note',  l.note,
           'scheduledDate', p.scheduled_date,
           'blocks', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', b.id, 'project_id', b.project_id, 'order_index', b.order_index,
                      'kind', b.kind, 'speaker', b.speaker, 'spoken', b.spoken,
                      'screen_text', b.screen_text, 'record_note', b.record_note,
                      'asset_kind', b.asset_kind, 'asset_note', b.asset_note,
                      'asset_url', b.asset_url, 'edit_note', b.edit_note,
                      'overlays', b.overlays, 'audio_source', b.audio_source,
                      'duration_sec', b.duration_sec)
                    order by b.order_index)
             from public.reel_blocks b where b.project_id = p.id), '[]'::jsonb))
  from public.reel_share_links l
  join public.projects p on p.id = l.reel_id and p.user_id = l.owner_user_id
  where l.token = p_token and l.revoked = false;
$$;

grant execute on function public.reel_share_view(text) to anon, authenticated;

notify pgrst, 'reload schema';
