-- 038: one link can carry MANY reels.
--
-- Fifteen reels prepared for one blogger meant fifteen links to send and fifteen
-- to keep track of. A link now holds a SET, and the single-reel link becomes a
-- set of one — same table, same page, no second concept.
--
-- `reel_id` stays on the link for the rows written before this, but membership
-- lives in `reel_share_items` from here on; the column is nullable so a set link
-- is not forced to nominate one of its reels as special.

create table if not exists public.reel_share_items (
  id          uuid primary key default gen_random_uuid(),
  link_id     uuid not null references public.reel_share_links(id) on delete cascade,
  reel_id     uuid not null references public.projects(id) on delete cascade,
  order_index integer not null default 0,
  unique (link_id, reel_id)
);

create index if not exists idx_reel_share_items_link on public.reel_share_items (link_id, order_index);

alter table public.reel_share_items enable row level security;

-- Ownership is the parent link's ownership. Qualified column names throughout:
-- an unqualified `link_id` here would repeat the 033 mistake.
drop policy if exists "owner manages own share items" on public.reel_share_items;
create policy "owner manages own share items" on public.reel_share_items for all
  using (exists (
    select 1 from public.reel_share_links l
    where l.id = reel_share_items.link_id and l.owner_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.reel_share_links l
    where l.id = reel_share_items.link_id and l.owner_user_id = (select auth.uid())
  ));

alter table public.reel_share_links add column if not exists title text;
alter table public.reel_share_links alter column reel_id drop not null;

-- Existing single-reel links become sets of one.
insert into public.reel_share_items (link_id, reel_id, order_index)
select l.id, l.reel_id, 0
from public.reel_share_links l
where l.reel_id is not null
  and not exists (select 1 from public.reel_share_items i where i.link_id = l.id);

-- Every reel behind a token, in order.
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
                      'blocks', coalesce((
                        select jsonb_agg(jsonb_build_object(
                                 'id', b.id, 'project_id', b.project_id,
                                 'order_index', b.order_index, 'kind', b.kind,
                                 'speaker', b.speaker, 'spoken', b.spoken,
                                 'screen_text', b.screen_text, 'record_note', b.record_note,
                                 'asset_kind', b.asset_kind, 'asset_note', b.asset_note,
                                 'asset_url', b.asset_url, 'edit_note', b.edit_note,
                                 'overlays', b.overlays, 'audio_source', b.audio_source,
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
