-- 041: the owner's progress read was returning a whole SET's ticks.
--
-- `reel_progress_for_owner` joined the link through `reel_share_items` to prove
-- the reel belongs to that link, then aggregated every progress row on the link.
-- On a fifteen-reel link that is fifteen reels' ticks handed to whichever reel
-- was asking: harmless keys (the builder only looks up its own blocks), but the
-- count shown on the page was the batch's, not this reel's.
--
-- Joining `reel_blocks` pins each row to the reel it actually belongs to.
create or replace function public.reel_progress_for_owner(p_reel_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(distinct pr.block_id::text || ':' || pr.slot), '[]'::jsonb)
  from public.reel_share_progress pr
  join public.reel_blocks b on b.id = pr.block_id and b.project_id = p_reel_id
  join public.reel_share_links l on l.id = pr.link_id
  join public.reel_share_items i on i.link_id = l.id and i.reel_id = p_reel_id
  join public.projects p on p.id = p_reel_id
  where pr.done and l.revoked = false and p.user_id = (select auth.uid());
$$;

grant execute on function public.reel_progress_for_owner(uuid) to authenticated;

notify pgrst, 'reload schema';
