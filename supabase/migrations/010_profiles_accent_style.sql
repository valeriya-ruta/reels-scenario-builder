-- Highlight style for `{…}` carousel accents (Brand DNA). Source of truth: profiles.accent_style.
alter table profiles
  add column if not exists accent_style text;

notify pgrst, 'reload schema';
