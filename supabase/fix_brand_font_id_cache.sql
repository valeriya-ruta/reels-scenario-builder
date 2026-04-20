-- One-shot fix: ensures font_id exists and forces PostgREST to reload (fixes "schema cache" errors).
-- Run in Supabase Dashboard → SQL → New query → Run.

alter table public.brand_settings
  add column if not exists font_id text not null default 'montserrat';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brand_settings' and column_name = 'title_font'
  ) then
    update public.brand_settings
    set font_id = 'cormorant'
    where font_id = 'montserrat'
      and (title_font ilike '%Cormorant%' or title_font ilike '%Garamond%');
  end if;
end $$;

alter table public.brand_settings drop column if exists title_font;
alter table public.brand_settings drop column if exists body_font;

notify pgrst, 'reload schema';

-- Optional: if NOTIFY alone was not enough (rare), Supabase suggests:
-- select pg_notification_queue_usage();
