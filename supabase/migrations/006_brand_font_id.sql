alter table brand_settings
  add column if not exists font_id text not null default 'montserrat';

-- One-time backfill when legacy columns still exist
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brand_settings' and column_name = 'title_font'
  ) then
    update brand_settings
    set font_id = 'cormorant'
    where font_id = 'montserrat'
      and (title_font ilike '%Cormorant%' or title_font ilike '%Garamond%');
  end if;
end $$;

alter table brand_settings drop column if exists title_font;
alter table brand_settings drop column if exists body_font;

-- PostgREST must reload or REST requests still see the old schema ("schema cache")
notify pgrst, 'reload schema';
