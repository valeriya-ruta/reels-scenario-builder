-- 021_content_status_postgrest_reload.sql
-- Make PostgREST expose the objects added in 020 (the new `status`/`content_type`
-- columns and the `content_pieces` view) to the REST API that supabase-js uses.
--
-- New objects created via direct SQL aren't picked up until PostgREST reloads its
-- schema cache, so until this runs `supabase.from('content_pieces')` and writes to
-- the new `status` column can 404 / fail. (Same pattern as migration 007.)
notify pgrst, 'reload schema';
