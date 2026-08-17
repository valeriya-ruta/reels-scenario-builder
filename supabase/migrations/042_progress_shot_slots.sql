-- 042: b-roll asked for inside a sentence is now on the SHOT list too.
--
-- «Поверх цієї фрази — відео з офісу» was only an editing instruction, so the
-- person filming never saw that anything had to be fetched. It now appears in
-- both lists, and it needs two independent ticks: filmed is not placed.
--
-- Shot ticks on an overlay use `shot:ov:<id>`, next to the existing
-- `edit:ov:<id>`. Same reasoning as 040 — the id is part of the value, so the
-- CHECK stays a shape check and the function remains the gatekeeper.
alter table public.reel_share_progress drop constraint if exists reel_share_progress_slot_check;
alter table public.reel_share_progress
  add constraint reel_share_progress_slot_check
  check (slot = 'take' or slot = 'asset' or slot like 'edit:%' or slot like 'shot:%')
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
  if not (p_slot in ('take','asset') or p_slot like 'edit:%' or p_slot like 'shot:%')
     or length(p_slot) > 80 then
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

grant execute on function public.reel_share_set_progress(text, uuid, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
