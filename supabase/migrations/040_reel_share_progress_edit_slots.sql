-- 040: editing gets ticked off too, not only filming.
--
-- `slot` was restricted to ('take','asset'). An edit instruction's slot names
-- its SOURCE inside the block — edit:screen, edit:note, edit:audio, edit:sound,
-- edit:asset, and edit:ov:<overlay-id> — so a tick survives another overlay
-- being added above it, which a positional index would not. Those cannot be
-- enumerated in a CHECK (an overlay id is part of the value), so the constraint
-- becomes a shape check and the function stays the gatekeeper.
alter table public.reel_share_progress drop constraint if exists reel_share_progress_slot_check;
alter table public.reel_share_progress
  add constraint reel_share_progress_slot_check
  check (slot = 'take' or slot = 'asset' or slot like 'edit:%')
  not valid;

alter table public.reel_share_progress validate constraint reel_share_progress_slot_check;

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
  -- A slot is either a shot half or an edit instruction; anything else is a
  -- caller inventing keys, and length is capped so it cannot be used as storage.
  if not (p_slot in ('take','asset') or p_slot like 'edit:%') or length(p_slot) > 80 then
    return false;
  end if;

  select l.id into v_link
  from public.reel_share_links l
  join public.reel_share_items i on i.link_id = l.id
  join public.reel_blocks b on b.project_id = i.reel_id
  where l.token = p_token and l.revoked = false and b.id = p_block_id
  limit 1;

  if v_link is null then return false; end if;

  if p_done then
    insert into public.reel_share_progress (link_id, block_id, slot, done)
    values (v_link, p_block_id, p_slot, true)
    on conflict (link_id, block_id, slot) do update set done = true, updated_at = now();
  else
    delete from public.reel_share_progress
    where link_id = v_link and block_id = p_block_id and slot = p_slot;
  end if;

  return true;
end;
$$;

-- What the OWNER sees: progress across every link that carries this reel, so the
-- builder can show what has already been done without her opening the client's
-- page.
create or replace function public.reel_progress_for_owner(p_reel_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(distinct pr.block_id::text || ':' || pr.slot), '[]'::jsonb)
  from public.reel_share_progress pr
  join public.reel_share_links l on l.id = pr.link_id
  join public.reel_share_items i on i.link_id = l.id and i.reel_id = p_reel_id
  join public.projects p on p.id = p_reel_id
  where pr.done and l.revoked = false and p.user_id = (select auth.uid());
$$;

grant execute on function public.reel_share_set_progress(text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.reel_progress_for_owner(uuid) to authenticated;

notify pgrst, 'reload schema';
