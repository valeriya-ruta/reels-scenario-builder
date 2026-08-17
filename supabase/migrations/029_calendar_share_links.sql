-- 029_calendar_share_links.sql
-- Share the content calendar with a client, read-only, without a login.
--
-- ⚠️ DB SCHEMA CHANGE — requires human sign-off before applying.
--
-- What it is: one unguessable token per user that opens a read-only copy of
-- План — the month grid, the content planned on each day, and the detail of any
-- piece the client taps. The client can look; nothing on that page writes.
--
-- Why functions instead of RLS policies: the client is anon, so a policy could
-- only ever say "anyone may read this row" — and a policy cannot see the token,
-- which is the only secret there is. Anon-readable rows would therefore hand out
-- every user's token to anyone who queried the table. The three SECURITY DEFINER
-- functions below take the token as an ARGUMENT, resolve it to exactly one
-- owner, and return only that owner's SCHEDULED content. Nothing else is
-- reachable, and every app table keeps its untouched owner-only RLS.
--
-- The link is live, not a snapshot: what the owner plans today is what the
-- client sees. Revoking sets `revoked` (or regenerating mints a new token), and
-- the functions stop resolving immediately.

-- 1. The links themselves ----------------------------------------------------
create table if not exists public.calendar_share_links (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  token         text not null unique,
  -- What the client sees at the top of the page (the creator's / brand's name).
  title         text,
  -- Optional note from the owner to the client, shown under the title.
  note          text,
  revoked       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.calendar_share_links enable row level security;

drop policy if exists "owner manages own calendar links" on public.calendar_share_links;
create policy "owner manages own calendar links" on public.calendar_share_links
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- NO anon read policy on this table, deliberately. A policy can only say
-- "anyone may read active links", which would let an anon client SELECT the
-- whole table and walk away with every user's token. The client reads its own
-- link through `calendar_share_meta` below, which takes the token as an argument
-- and can therefore return exactly one row.
drop policy if exists "anyone can read an active calendar link" on public.calendar_share_links;

create index if not exists idx_calendar_share_links_token on public.calendar_share_links (token);
create index if not exists idx_calendar_share_links_owner on public.calendar_share_links (owner_user_id);

-- 2. The page header behind a token (title + note, nothing else) -------------
create or replace function public.calendar_share_meta(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object('token', l.token, 'title', l.title, 'note', l.note)
  from public.calendar_share_links l
  where l.token = p_token and l.revoked = false;
$$;

-- 3. The shared calendar: every DATED piece of the token's owner --------------
-- Ideas are deliberately absent: an idea has no date it is committed to, and a
-- client's calendar should show the plan, not the maybes.
create or replace function public.calendar_share_pieces(p_token text)
returns table (
  id             uuid,
  content_type   text,
  status         text,
  title          text,
  ref_table      text,
  scheduled_date date,
  set_index      integer,
  set_size       integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select l.owner_user_id into v_owner
  from public.calendar_share_links l
  where l.token = p_token and l.revoked = false;

  if v_owner is null then
    return;
  end if;

  return query
    select c.id, 'carousel'::text, c.status, c.name, 'carousel_projects'::text,
           c.scheduled_date, null::integer, null::integer
    from public.carousel_projects c
    where c.user_id = v_owner and c.scheduled_date is not null
    union all
    select p.id, 'reel'::text, p.status, p.name, 'projects'::text,
           p.scheduled_date, null::integer, null::integer
    from public.projects p
    where p.user_id = v_owner and p.scheduled_date is not null and p.project_type = 'reels'
    union all
    select s.id, 'story'::text, s.status, s.name, 'storytelling_projects'::text,
           s.scheduled_date, s.set_index, s.set_size
    from public.storytelling_projects s
    where s.user_id = v_owner and s.scheduled_date is not null;
end;
$$;

-- 4. One piece, in full — what opens when the client taps a card -------------
-- Returns a single jsonb document per piece so the page renders scenes / slides
-- / stories without three more round trips. NULL for an unknown token, a
-- revoked link, a piece that is not the owner's, or a piece with no date (a
-- shared calendar must not become a back door into undated drafts).
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
  v_owner  uuid;
  v_result jsonb;
begin
  select l.owner_user_id into v_owner
  from public.calendar_share_links l
  where l.token = p_token and l.revoked = false;

  if v_owner is null then
    return null;
  end if;

  if p_ref_table = 'storytelling_projects' then
    select jsonb_build_object(
             'kind', 'story',
             'id', s.id,
             'title', s.name,
             'status', s.status,
             'scheduledDate', s.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(
                        jsonb_build_object(
                          'text', st.text,
                          'visual', st.visual,
                          'engagement', st.engagement
                        )
                        order by col.order_index, st.order_index
                      )
               from public.storytelling_columns col
               join public.storytelling_stories st on st.column_id = col.id
               where col.project_id = s.id
             ), '[]'::jsonb)
           )
    into v_result
    from public.storytelling_projects s
    where s.id = p_id and s.user_id = v_owner and s.scheduled_date is not null;

  elsif p_ref_table = 'projects' then
    select jsonb_build_object(
             'kind', 'reel',
             'id', p.id,
             'title', p.name,
             'status', p.status,
             'scheduledDate', p.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(
                        jsonb_build_object(
                          'name', sc.name,
                          'lines', sc.lines,
                          'framing', sc.framing,
                          'shotSize', sc.shot_size,
                          'actorNote', sc.actor_note
                        )
                        order by sc.order_index
                      )
               from public.scenes sc
               where sc.project_id = p.id
             ), '[]'::jsonb)
           )
    into v_result
    from public.projects p
    where p.id = p_id and p.user_id = v_owner and p.scheduled_date is not null;

  elsif p_ref_table = 'carousel_projects' then
    select jsonb_build_object(
             'kind', 'carousel',
             'id', c.id,
             'title', c.name,
             'status', c.status,
             'scheduledDate', c.scheduled_date,
             'blocks', coalesce((
               select jsonb_agg(
                        jsonb_build_object(
                          'title', slide->>'title',
                          'body', slide->>'body',
                          'background', slide->>'backgroundColor',
                          'titleColor', slide->>'titleColor',
                          'bodyColor', slide->>'bodyColor'
                        )
                        order by t.ord
                      )
               from jsonb_array_elements(
                      case when jsonb_typeof(c.slides) = 'array' then c.slides else '[]'::jsonb end
                    ) with ordinality as t(slide, ord)
             ), '[]'::jsonb)
           )
    into v_result
    from public.carousel_projects c
    where c.id = p_id and c.user_id = v_owner and c.scheduled_date is not null;
  end if;

  return v_result;
end;
$$;

-- The no-login client calls both as `anon`; the owner's own preview is
-- `authenticated`. Neither can reach anything the token does not name.
grant execute on function public.calendar_share_meta(text) to anon, authenticated;
grant execute on function public.calendar_share_pieces(text) to anon, authenticated;
grant execute on function public.calendar_share_piece(text, text, uuid) to anon, authenticated;
