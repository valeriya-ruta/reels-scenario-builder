-- 030_calendar_share_postgrest_reload.sql
-- Make PostgREST expose the objects added in 028 + 029 to the REST API that
-- supabase-js uses.
--
-- New objects created via direct SQL are not picked up until PostgREST reloads
-- its schema cache. Until it does, `supabase.rpc('calendar_share_meta', …)`
-- 404s — which the shared page cannot tell apart from "this token is dead", so
-- every share link would render as Not Found. Same pattern as migrations 007
-- and 021.
notify pgrst, 'reload schema';
