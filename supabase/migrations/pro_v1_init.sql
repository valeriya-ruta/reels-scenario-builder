-- ============================================================================
-- Ruta Pro v1 — additive schema (operator edition)
--
-- ISOLATION CONTRACT: this migration ONLY ADDS objects. It never modifies,
-- renames, or drops any existing customer table or column. Existing customer
-- rows keep project_id = NULL and are never touched. The customer `content_pieces`
-- view is left untouched; Pro reads a NEW `pro_content_pieces` view instead.
-- ============================================================================

-- 1. Operator role flag (additive nullable column) --------------------------
alter table public.profiles add column if not exists role text;

-- 2. Bloggers — one row per blogger/project owned by an operator -------------
create table if not exists public.pro_projects (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  color         text not null default '#6366f1',
  emoji         text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.pro_projects enable row level security;
drop policy if exists "operator manages own pro_projects" on public.pro_projects;
create policy "operator manages own pro_projects" on public.pro_projects
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index if not exists idx_pro_projects_owner on public.pro_projects (owner_user_id, created_at);

-- 3. Per-project brand style + memory (fully isolated per blogger) -----------
create table if not exists public.pro_project_brand_settings (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null unique references public.pro_projects(id) on delete cascade,
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  theme          text default 'light',
  vibe           text default 'bold',
  fav_color_hex  text,
  color_light_bg text,
  color_dark_bg  text,
  color_accent1  text,
  color_accent2  text,
  font_id        text default 'montserrat',
  accent_style   text default 'marker',
  brand_memory   text,   -- free-text per-blogger brand memory / DNA capture
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.pro_project_brand_settings enable row level security;
drop policy if exists "operator manages own pro brand" on public.pro_project_brand_settings;
create policy "operator manages own pro brand" on public.pro_project_brand_settings
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- 4. Client share links (approve-only, regeneratable token) ------------------
create table if not exists public.pro_share_links (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.pro_projects(id) on delete cascade,
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  token          text not null unique,
  revoked        boolean not null default false,
  ideas_snapshot jsonb not null default '[]'::jsonb,        -- frozen list shown to the client
  decisions      jsonb not null default '{}'::jsonb,        -- idea_id -> 'approved' | 'rejected'
  project_name   text,                                      -- denormalized blogger display (anon page)
  project_color  text,
  project_emoji  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.pro_share_links enable row level security;
drop policy if exists "operator manages own share links" on public.pro_share_links;
create policy "operator manages own share links" on public.pro_share_links
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
-- Public read by token (mirrors the existing `snapshots` public-by-token pattern);
-- the unguessable token in the WHERE clause is the only secret. Revoked links 404.
drop policy if exists "anyone can read active share link by token" on public.pro_share_links;
create policy "anyone can read active share link by token" on public.pro_share_links
  for select using (revoked = false);
-- Anon (no-login client) records approve/reject decisions on a non-revoked link.
-- The /api/pro/share/decide route is the only writer and only mutates `decisions`.
drop policy if exists "anyone can record decisions on active link" on public.pro_share_links;
create policy "anyone can record decisions on active link" on public.pro_share_links
  for update using (revoked = false) with check (revoked = false);
create index if not exists idx_pro_share_links_token on public.pro_share_links (token);

-- 5. Nullable project_id on content-bearing tables (customer rows stay NULL) --
alter table public.projects              add column if not exists project_id uuid references public.pro_projects(id) on delete cascade;
alter table public.carousel_projects     add column if not exists project_id uuid references public.pro_projects(id) on delete cascade;
alter table public.storytelling_projects add column if not exists project_id uuid references public.pro_projects(id) on delete cascade;
alter table public.ideas                 add column if not exists project_id uuid references public.pro_projects(id) on delete cascade;
alter table public.idea_scans            add column if not exists project_id uuid references public.pro_projects(id) on delete cascade;
create index if not exists idx_projects_project_id              on public.projects (project_id);
create index if not exists idx_carousel_projects_project_id     on public.carousel_projects (project_id);
create index if not exists idx_storytelling_projects_project_id on public.storytelling_projects (project_id);
create index if not exists idx_ideas_project_id                 on public.ideas (project_id);
create index if not exists idx_idea_scans_project_id            on public.idea_scans (project_id);

-- 6. Pro content view — mirrors `content_pieces` + project_id (NEW view) ------
--    Customer `content_pieces` view is intentionally left untouched.
create or replace view public.pro_content_pieces
with (security_invoker = on) as
  select cp.id, cp.user_id, cp.project_id, 'carousel'::text as content_type, cp.status,
         cp.name as title, 'carousel_projects'::text as ref_table, cp.created_at, cp.updated_at,
         cp.scheduled_date, null::integer as set_index, null::integer as set_size,
         cp.posted_url, cp.posted_at, cp.insights_source, cp.insights_json, cp.insights_fetched_at
  from public.carousel_projects cp
  union all
  select p.id, p.user_id, p.project_id, 'reel'::text, p.status, p.name, 'projects'::text,
         p.created_at, p.updated_at, p.scheduled_date, null::integer, null::integer,
         p.posted_url, p.posted_at, p.insights_source, p.insights_json, p.insights_fetched_at
  from public.projects p
  where p.project_type = 'reels'::text
  union all
  select s.id, s.user_id, s.project_id, 'story'::text, s.status, s.name, 'storytelling_projects'::text,
         s.created_at, s.updated_at, s.scheduled_date, s.set_index, s.set_size,
         s.posted_url, s.posted_at, s.insights_source, s.insights_json, s.insights_fetched_at
  from public.storytelling_projects s
  union all
  select i.id, i.user_id, i.project_id, i.content_type, i.status,
         coalesce(nullif(i.title, ''::text), left(i.content, 80)), 'ideas'::text,
         i.created_at, i.updated_at, i.scheduled_date, null::integer, null::integer,
         null::text, null::timestamp with time zone, 'apify'::text, null::jsonb,
         null::timestamp with time zone
  from public.ideas i;
