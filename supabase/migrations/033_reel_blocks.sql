-- 033_reel_blocks.sql
-- A reel becomes a stack of BLOCKS you mix freely.
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- Why the old shape had to go: `scenes` assumes one person standing in front of
-- a camera. `framing`, `pose`, `arm_state` and `facing` are NOT NULL enums, and
-- `lines` is the only place content can live. So a reel that is a dialogue has
-- nowhere to say WHO speaks; a trend reel has nowhere to put the text that
-- appears on screen, or which clip runs under it; and "while you say this, an
-- image pops up" — an EDIT instruction, not a shot — cannot be written at all.
--
-- A block answers two questions, always:
--     як знімати  (record_note / asset_*)  — what a camera has to capture
--     як монтувати (edit_note / overlays)  — what the editor does with it
--
-- Kinds:
--   talk      говорю в камеру   — spoken text, optionally with on-screen caption
--   dialogue  діалог            — spoken text attributed to a speaker
--   text      текст на екрані   — text card, nothing spoken
--   broll     відео / нарізка   — a clip to film or to find; usually no speech
--   sound     звук / тренд      — the trending audio or reference the reel rides
--
-- Overlays live ON a block rather than beside it, because "поки кажеш оце —
-- вискакує ось таке" happens DURING that block. Modelled as jsonb so adding an
-- overlay is one row update, not a second table and a join:
--   [{ "at": "на слові «дорого»", "kind": "image|video|text", "note": "...", "url": "..." }]
--
-- `scenes` is left untouched and its rows are copied in below, so every reel
-- written before today opens with its text intact.

create table if not exists public.reel_blocks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  order_index  integer not null default 0,

  kind         text not null default 'talk'
               check (kind in ('talk','dialogue','text','broll','sound')),

  -- ── what is said / shown ──
  speaker      text,   -- dialogue: who is talking
  spoken       text,   -- said out loud, word for word
  screen_text  text,   -- appears on screen

  -- ── how to record ──
  record_note  text,   -- «крупний план, у машині»; null = nothing to direct
  -- What the block needs that isn't the creator talking. `asset_kind` is what
  -- someone has to DO to get it, which is the question a shot list answers.
  asset_kind   text check (asset_kind in ('film','find','screenshot','photo')),
  asset_note   text,   -- «руки, що тримають каву, крупно»
  asset_url    text,   -- reference / the actual clip

  -- ── how to edit ──
  edit_note    text,
  overlays     jsonb not null default '[]'::jsonb,

  duration_sec integer,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_reel_blocks_project on public.reel_blocks (project_id, order_index);

alter table public.reel_blocks enable row level security;

-- Ownership is the parent reel's ownership (mirrors the `scenes` policies).
drop policy if exists "owner reads own reel blocks" on public.reel_blocks;
create policy "owner reads own reel blocks" on public.reel_blocks for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

drop policy if exists "owner writes own reel blocks" on public.reel_blocks;
create policy "owner writes own reel blocks" on public.reel_blocks for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

drop policy if exists "owner updates own reel blocks" on public.reel_blocks;
create policy "owner updates own reel blocks" on public.reel_blocks for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

drop policy if exists "owner deletes own reel blocks" on public.reel_blocks;
create policy "owner deletes own reel blocks" on public.reel_blocks for delete
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- ── Carry every existing reel across ────────────────────────────────────────
-- One `talk` block per scene, keeping its text and both notes. Idempotent: a
-- reel that already has blocks is skipped, so re-running never doubles a reel.
insert into public.reel_blocks (project_id, order_index, kind, spoken, record_note, edit_note, created_at)
select s.project_id, s.order_index, 'talk', s.lines, s.actor_note, s.editor_note, coalesce(s.created_at, now())
from public.scenes s
join public.projects p on p.id = s.project_id and p.project_type = 'reels'
where not exists (select 1 from public.reel_blocks b where b.project_id = s.project_id);

-- ── The shared calendar shows a reel as its blocks ──────────────────────────
-- The client's detail view is the whole point of this rewrite: it has to read
-- as "record this, say this, edit that" rather than as a row of enum values.
-- Scoping (migration 032) is unchanged — only the reel branch's body differs.
create or replace function public.calendar_share_piece(
  p_token     text,
  p_ref_table text,
  p_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_project uuid;
  v_result  jsonb;
begin
  select l.owner_user_id, l.project_id into v_owner, v_project
  from public.calendar_share_links l
  where l.token = p_token and l.revoked = false;

  if v_owner is null then
    return null;
  end if;

  if p_ref_table = 'storytelling_projects' then
    select jsonb_build_object(
             'kind', 'story', 'id', s.id, 'title', s.name, 'status', s.status,
             'scheduledDate', s.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'text', st.text, 'visual', st.visual, 'engagement', st.engagement)
                      order by col.order_index, st.order_index)
               from public.storytelling_columns col
               join public.storytelling_stories st on st.column_id = col.id
               where col.project_id = s.id
             ), '[]'::jsonb))
    into v_result
    from public.storytelling_projects s
    where s.id = p_id and s.user_id = v_owner and s.scheduled_date is not null
      and s.project_id is not distinct from v_project;

  elsif p_ref_table = 'projects' then
    select jsonb_build_object(
             'kind', 'reel', 'id', p.id, 'title', p.name, 'status', p.status,
             'scheduledDate', p.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'blockKind',  b.kind,
                        'speaker',    b.speaker,
                        'spoken',     b.spoken,
                        'screenText', b.screen_text,
                        'recordNote', b.record_note,
                        'assetKind',  b.asset_kind,
                        'assetNote',  b.asset_note,
                        'assetUrl',   b.asset_url,
                        'editNote',   b.edit_note,
                        'overlays',   b.overlays)
                      order by b.order_index)
               from public.reel_blocks b
               where b.project_id = p.id
             ), '[]'::jsonb))
    into v_result
    from public.projects p
    where p.id = p_id and p.user_id = v_owner and p.scheduled_date is not null
      and p.project_id is not distinct from v_project;

  elsif p_ref_table = 'carousel_projects' then
    select jsonb_build_object(
             'kind', 'carousel', 'id', c.id, 'title', c.name, 'status', c.status,
             'scheduledDate', c.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'title', slide->>'title', 'body', slide->>'body',
                        'background', slide->>'backgroundColor',
                        'titleColor', slide->>'titleColor',
                        'bodyColor', slide->>'bodyColor')
                      order by t.ord)
               from jsonb_array_elements(
                      case when jsonb_typeof(c.slides) = 'array' then c.slides else '[]'::jsonb end
                    ) with ordinality as t(slide, ord)
             ), '[]'::jsonb))
    into v_result
    from public.carousel_projects c
    where c.id = p_id and c.user_id = v_owner and c.scheduled_date is not null
      and c.project_id is not distinct from v_project;
  end if;

  return v_result;
end;
$$;

grant execute on function public.calendar_share_piece(text, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
