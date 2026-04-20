alter table brand_settings
  add column if not exists accent_style text not null default 'bold';

notify pgrst, 'reload schema';
