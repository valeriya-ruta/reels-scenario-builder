-- 022_idea_content_links.sql
-- Persistent idea → content link (task 86d3czf1e). Foreshadowed in 019_ideas.sql
-- ("No idea_id link from content pieces yet — that belongs to a future
-- 'one idea -> three reels' spec").
--
-- ⚠️ DB SCHEMA CHANGE — requires Kunj sign-off before applying to prod.
--
-- When a user turns a braindump idea into a Рілс / Карусель / Сторітел, we record
-- the link here so reopening the idea shows what was already created from it (and
-- so we never offer to create a duplicate of the same type). One row per
-- (idea, content_type); re-linking the same type updates the target id.

create table if not exists public.idea_content_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  -- The braindump's ContentType values, kept as-is for a direct UI mapping.
  content_type text not null check (content_type in ('reels','carousel','stories')),
  content_id uuid not null,
  created_at timestamptz not null default now(),
  unique (idea_id, content_type)
);

create index if not exists idx_idea_content_links_idea on public.idea_content_links (idea_id);
create index if not exists idx_idea_content_links_user on public.idea_content_links (user_id);

alter table public.idea_content_links enable row level security;

drop policy if exists "Users can view own idea links" on public.idea_content_links;
create policy "Users can view own idea links" on public.idea_content_links
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own idea links" on public.idea_content_links;
create policy "Users can insert own idea links" on public.idea_content_links
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own idea links" on public.idea_content_links;
create policy "Users can update own idea links" on public.idea_content_links
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own idea links" on public.idea_content_links;
create policy "Users can delete own idea links" on public.idea_content_links
  for delete using (auth.uid() = user_id);
