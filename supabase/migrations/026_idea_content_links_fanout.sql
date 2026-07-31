-- 026_idea_content_links_fanout.sql
--
-- ✅ APPLIED TO PROD (ohhudfwwdcbpxryxmvmd) on 2026-07-31, on Ruta's sign-off.
--    Verified after: the old narrow constraint is gone, the wide one is in
--    place, `idx_idea_content_links_content` exists, and the existing row
--    survived. Built on branch `ux/september-overhaul`.
--
-- WHY
-- 022 gave a braindump at most ONE child per content type
-- (`unique (idea_id, content_type)`), which was right when a dump produced one
-- reel or one carousel. It is wrong now: a braindump legitimately fans out into
-- 2–3 dated stories ("this dump → 3 stories, 1 carousel"), and under the old
-- constraint the upsert silently OVERWROTE story 1's link with story 2's — so
-- the dump could never own more than one child and the fan-out was untraceable.
--
-- WHAT
-- Widen the uniqueness to the actual identity of a link: one row per
-- (idea, type, target). Re-linking the same target stays idempotent; linking a
-- second story to the same dump now inserts instead of clobbering.
--
-- SAFETY
-- Purely widening — every row valid under the old constraint is valid under the
-- new one, so this is non-destructive and needs no backfill. The app degrades
-- gracefully if this is NOT applied: `linkIdeaToContent` swallows failures, so
-- an unapplied migration means siblings past the first are simply not recorded
-- (exactly today's behaviour), never a broken create flow.

alter table public.idea_content_links
  drop constraint if exists idea_content_links_idea_id_content_type_key;

-- Named explicitly so a re-run is a no-op and the intent is greppable.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'idea_content_links_idea_type_target_key'
  ) then
    alter table public.idea_content_links
      add constraint idea_content_links_idea_type_target_key
      unique (idea_id, content_type, content_id);
  end if;
end $$;

-- Reverse lookup: "which dump did this piece come from?" powers the trace-back
-- chip on every content piece, so it must not table-scan.
create index if not exists idx_idea_content_links_content
  on public.idea_content_links (content_id);
