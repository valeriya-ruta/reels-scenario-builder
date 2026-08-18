-- 046: name the reel-refs storage policies after their bucket.
--
-- 045 created them as «own folder insert» and friends. The project already had
-- a bucket whose policies are named `carousel_lab_obj_*`, and a second set of
-- generically-named policies on the same table is a trap: a future migration
-- doing `drop policy if exists "own folder insert"` cannot say which bucket it
-- meant. Same rules, names that carry their scope.
drop policy if exists "own folder insert" on storage.objects;
drop policy if exists "own folder update" on storage.objects;
drop policy if exists "own folder delete" on storage.objects;
drop policy if exists "reel refs are readable by anyone" on storage.objects;

drop policy if exists "reel_refs_obj_read" on storage.objects;
create policy "reel_refs_obj_read" on storage.objects for select
  using (bucket_id = 'reel-refs');

drop policy if exists "reel_refs_obj_insert_own" on storage.objects;
create policy "reel_refs_obj_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'reel-refs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "reel_refs_obj_update_own" on storage.objects;
create policy "reel_refs_obj_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'reel-refs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "reel_refs_obj_delete_own" on storage.objects;
create policy "reel_refs_obj_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'reel-refs' and (storage.foldername(name))[1] = (select auth.uid())::text);
