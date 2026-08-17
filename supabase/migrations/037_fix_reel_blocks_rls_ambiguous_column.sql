-- 037_fix_reel_blocks_rls_ambiguous_column.sql
-- The reel_blocks policies never matched anything.
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- 033 wrote them as `where p.id = project_id`. `projects` HAS its own
-- `project_id` column — the Pro blogger tag added by pro_v1_init — so Postgres
-- bound that bare name to the inner table and every policy compiled to
--
--     p.id = p.project_id
--
-- which is never true. Select returned no rows, so the builder showed an empty
-- reel; insert was refused, so adding a block did nothing at all. Nothing
-- errored anywhere: RLS denies by returning nothing.
--
-- It survived review because every check I ran went through the service role,
-- which bypasses RLS. A policy is only verified by impersonating the role it
-- governs:
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<user-id>","role":"authenticated"}';
--
-- Qualified with the table name so the reference can only mean the row's parent
-- reel. `(select auth.uid())` lets the planner hoist the call out of the per-row
-- check rather than calling it once per row.

drop policy if exists "owner reads own reel blocks" on public.reel_blocks;
create policy "owner reads own reel blocks" on public.reel_blocks for select
  using (exists (
    select 1 from public.projects p
    where p.id = reel_blocks.project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists "owner writes own reel blocks" on public.reel_blocks;
create policy "owner writes own reel blocks" on public.reel_blocks for insert
  with check (exists (
    select 1 from public.projects p
    where p.id = reel_blocks.project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists "owner updates own reel blocks" on public.reel_blocks;
create policy "owner updates own reel blocks" on public.reel_blocks for update
  using (exists (
    select 1 from public.projects p
    where p.id = reel_blocks.project_id and p.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = reel_blocks.project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists "owner deletes own reel blocks" on public.reel_blocks;
create policy "owner deletes own reel blocks" on public.reel_blocks for delete
  using (exists (
    select 1 from public.projects p
    where p.id = reel_blocks.project_id and p.user_id = (select auth.uid())
  ));

notify pgrst, 'reload schema';
