-- Canonical home for captured ideas (braindump quick-capture).
-- Approved in task 86d38zghd. Nullable `title` reserved for future list/swipe-deck
-- labels (left null on braindump saves). No idea_id link from content pieces yet —
-- that belongs to a future "one idea -> three reels" spec.

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  content text not null,
  source text not null default 'braindump',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ideas_user_created on public.ideas (user_id, created_at desc);

alter table public.ideas enable row level security;

drop policy if exists "Users can view own ideas" on public.ideas;
create policy "Users can view own ideas" on public.ideas
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own ideas" on public.ideas;
create policy "Users can insert own ideas" on public.ideas
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own ideas" on public.ideas;
create policy "Users can update own ideas" on public.ideas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ideas" on public.ideas;
create policy "Users can delete own ideas" on public.ideas
  for delete using (auth.uid() = user_id);

-- Keep updated_at fresh on edits (reuses the existing shared trigger function).
drop trigger if exists update_ideas_updated_at on public.ideas;
create trigger update_ideas_updated_at
  before update on public.ideas
  for each row execute function update_updated_at_column();
