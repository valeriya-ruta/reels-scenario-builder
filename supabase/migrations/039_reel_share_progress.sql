-- 039: she ticks off what she has already recorded.
--
-- Kept in the database rather than in her browser's localStorage, on purpose:
-- local storage would help only her, only on that one device, and the person who
-- most needs to know what has been filmed is the one who wrote the plan. Stored
-- against the LINK, so revoking it takes the progress with it.
--
-- A shot has no row of its own — the shot list is derived from the blocks — so
-- the key is the block it came from plus which half of it this is: a talking
-- block yields a "take", and any block with an asset yields an "asset". That
-- pair is stable across edits to the text, which a positional index would not be.

create table if not exists public.reel_share_progress (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references public.reel_share_links(id) on delete cascade,
  block_id   uuid not null references public.reel_blocks(id) on delete cascade,
  slot       text not null check (slot in ('take','asset')),
  done       boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (link_id, block_id, slot)
);

create index if not exists idx_reel_share_progress_link on public.reel_share_progress (link_id);

alter table public.reel_share_progress enable row level security;

-- The owner can read her blogger's progress; nobody writes through the table.
drop policy if exists "owner reads progress" on public.reel_share_progress;
create policy "owner reads progress" on public.reel_share_progress for select
  using (exists (
    select 1 from public.reel_share_links l
    where l.id = reel_share_progress.link_id and l.owner_user_id = (select auth.uid())
  ));

-- The client writes through this function only: it takes the token, so it can
-- only ever touch the progress of the link she actually holds, and it refuses a
-- block that is not part of that link's reels.
create or replace function public.reel_share_set_progress(
  p_token text, p_block_id uuid, p_slot text, p_done boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_link uuid;
begin
  select l.id into v_link
  from public.reel_share_links l
  join public.reel_share_items i on i.link_id = l.id
  join public.reel_blocks b on b.project_id = i.reel_id
  where l.token = p_token and l.revoked = false and b.id = p_block_id
  limit 1;

  if v_link is null then return false; end if;
  if p_slot not in ('take','asset') then return false; end if;

  if p_done then
    insert into public.reel_share_progress (link_id, block_id, slot, done)
    values (v_link, p_block_id, p_slot, true)
    on conflict (link_id, block_id, slot)
      do update set done = true, updated_at = now();
  else
    delete from public.reel_share_progress
    where link_id = v_link and block_id = p_block_id and slot = p_slot;
  end if;

  return true;
end;
$$;

-- What has been ticked, for the client's page to render on load.
create or replace function public.reel_share_progress_view(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(pr.block_id::text || ':' || pr.slot), '[]'::jsonb)
  from public.reel_share_progress pr
  join public.reel_share_links l on l.id = pr.link_id
  where l.token = p_token and l.revoked = false and pr.done;
$$;

grant execute on function public.reel_share_set_progress(text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.reel_share_progress_view(text) to anon, authenticated;

notify pgrst, 'reload schema';
