-- 027_posted_links_insights.sql
--
-- ⚠️ DB SCHEMA CHANGE — BRANCH + PR ONLY. Do NOT apply to prod before sign-off.
--    Branch: `feat/posted-links-insights`.
--
-- WHY
-- The whole insights + gamification loop hangs off one fact the app does not
-- currently store: WHERE a piece was posted. Without a URL there is nothing to
-- pull performance from, nothing to count for the submission coin, and no way
-- to tell a winner from a dud.
--
-- WHAT
-- Per-table columns on the three content tables. A polymorphic side-table was
-- considered and rejected for now (see the PR): every read in the app already
-- goes through per-table queries plus the `content_pieces` view, so a join would
-- add a moving part to every one of them for a set of columns that is 1:1 with
-- the row. If a fourth content type or per-post history arrives, promoting these
-- to `content_posts` is a contained follow-up — nothing here forecloses it.
--
--   posted_url          where it went live (nullable — most rows never post)
--   posted_at           when (nullable; set alongside the URL, not on status)
--   insights_source     'apify' | 'graph'. Defaults to 'apify'. 'graph' is
--                       reserved for a future Meta/Graph upgrade and is NEVER
--                       written by September scope — it exists so adding it
--                       later is not another migration.
--   insights_json       raw pulled metrics (views/likes/reach/saves/…). jsonb
--                       rather than typed columns because the shape is the
--                       scraper's, not ours, and it will change without us.
--   insights_fetched_at when the pull last succeeded (nullable = never pulled)
--
-- Named `insights_source` rather than `source`: `ideas` already has a `source`
-- column meaning something entirely different ('braindump'), and two columns
-- with the same name and unrelated meanings is how someone later joins the
-- wrong thing.
--
-- SAFETY
-- Purely additive. Every column is nullable (or defaulted), no existing row
-- changes, no backfill, and nothing reads these until the app ships. Safe to
-- apply ahead of the code.

do $$
declare
  t text;
begin
  foreach t in array array['carousel_projects', 'projects', 'storytelling_projects']
  loop
    execute format('alter table public.%I add column if not exists posted_url text', t);
    execute format('alter table public.%I add column if not exists posted_at timestamptz', t);
    execute format(
      'alter table public.%I add column if not exists insights_source text not null default ''apify''',
      t
    );
    execute format('alter table public.%I add column if not exists insights_json jsonb', t);
    execute format('alter table public.%I add column if not exists insights_fetched_at timestamptz', t);

    -- Constrain the enum in the DB, not only in TypeScript: this column decides
    -- which pull path runs, and a typo would silently route to nothing.
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_insights_source_check'
    );
    execute format(
      'alter table public.%I add constraint %I check (insights_source in (''apify'', ''graph''))',
      t, t || '_insights_source_check'
    );

    -- The submission counter and the "needs a pull" sweep both filter on
    -- "has a posted_url", which is a small minority of rows → partial index.
    execute format(
      'create index if not exists %I on public.%I (user_id, posted_at desc) where posted_url is not null',
      'idx_' || t || '_posted', t
    );
  end loop;
end $$;

-- Surface the posted fields on the unified content read so the Insights list,
-- the coin count and the card badges are one query rather than three.
-- CREATE OR REPLACE VIEW can only APPEND columns, never reorder them — so the
-- new ones go at the end, after 025's set_index / set_size.
create or replace view public.content_pieces
with (security_invoker = on) as
  select
    cp.id, cp.user_id, 'carousel'::text as content_type, cp.status,
    cp.name as title, 'carousel_projects'::text as ref_table,
    cp.created_at, cp.updated_at, cp.scheduled_date,
    null::integer as set_index, null::integer as set_size,
    cp.posted_url, cp.posted_at, cp.insights_source, cp.insights_json, cp.insights_fetched_at
  from public.carousel_projects cp
  union all
  select p.id, p.user_id, 'reel', p.status, p.name, 'projects',
    p.created_at, p.updated_at, p.scheduled_date,
    null::integer, null::integer,
    p.posted_url, p.posted_at, p.insights_source, p.insights_json, p.insights_fetched_at
  from public.projects p
  where p.project_type = 'reels'
  union all
  select s.id, s.user_id, 'story', s.status, s.name, 'storytelling_projects',
    s.created_at, s.updated_at, s.scheduled_date,
    s.set_index, s.set_size,
    s.posted_url, s.posted_at, s.insights_source, s.insights_json, s.insights_fetched_at
  from public.storytelling_projects s
  union all
  select
    i.id, i.user_id, i.content_type, i.status,
    coalesce(nullif(i.title, ''), left(i.content, 80)) as title,
    'ideas', i.created_at, i.updated_at, i.scheduled_date,
    null::integer, null::integer,
    -- Ideas are not posted things; they carry the columns as nulls so the view
    -- stays one shape.
    null::text, null::timestamptz, 'apify'::text, null::jsonb, null::timestamptz
  from public.ideas i;

grant select on public.content_pieces to authenticated;
