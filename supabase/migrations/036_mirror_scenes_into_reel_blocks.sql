-- 036_mirror_scenes_into_reel_blocks.sql
-- Anything written into `scenes` shows up as a block.
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- The bug this fixes: the builder reads `reel_blocks` (033), but FIVE code paths
-- still create `scenes` — the rant generator, the competitor import, the two
-- structure templates and the append helper. A reel generated after 033 shipped
-- therefore opened completely blank. Two real reels did.
--
-- Mirroring at the TABLE rather than at those five call sites is deliberate: it
-- catches every path, including ones not yet traced and any added later.
-- Patching each writer is only correct until the next writer.
--
-- `scene_id` ties a mirrored block to the scene it came from, ON DELETE CASCADE,
-- so a flow that clears and rewrites a reel's scenes takes its mirrored blocks
-- with it rather than leaving orphans behind.
--
-- Additive for the customer edition: this only ever writes to `reel_blocks`, a
-- table `main` does not read.

alter table public.reel_blocks
  add column if not exists scene_id uuid references public.scenes(id) on delete cascade;

create unique index if not exists idx_reel_blocks_scene on public.reel_blocks (scene_id)
  where scene_id is not null;

create or replace function public.mirror_scene_to_reel_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only reels; a storytelling never had scenes to begin with.
  if not exists (
    select 1 from public.projects p
    where p.id = new.project_id and p.project_type = 'reels'
  ) then
    return new;
  end if;

  insert into public.reel_blocks
    (project_id, scene_id, order_index, kind, spoken, record_note, edit_note)
  values
    (new.project_id, new.id, new.order_index, 'talk', new.lines, new.actor_note, new.editor_note)
  on conflict (scene_id) where scene_id is not null do nothing;

  return new;
end;
$$;

drop trigger if exists mirror_scene_insert on public.scenes;
create trigger mirror_scene_insert
  after insert on public.scenes
  for each row execute function public.mirror_scene_to_reel_block();

-- Keep the text in step while a reel is still being written by an old path.
create or replace function public.mirror_scene_update_to_reel_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reel_blocks
     set spoken      = new.lines,
         record_note = new.actor_note,
         edit_note   = new.editor_note,
         order_index = new.order_index,
         updated_at  = now()
   where scene_id = new.id;
  return new;
end;
$$;

drop trigger if exists mirror_scene_update on public.scenes;
create trigger mirror_scene_update
  after update on public.scenes
  for each row execute function public.mirror_scene_update_to_reel_block();

-- Catch up the reels created between 033 and this, which opened blank.
insert into public.reel_blocks
  (project_id, scene_id, order_index, kind, spoken, record_note, edit_note, created_at)
select s.project_id, s.id, s.order_index, 'talk', s.lines, s.actor_note, s.editor_note,
       coalesce(s.created_at, now())
from public.scenes s
join public.projects p on p.id = s.project_id and p.project_type = 'reels'
where not exists (select 1 from public.reel_blocks b where b.project_id = s.project_id);

notify pgrst, 'reload schema';
