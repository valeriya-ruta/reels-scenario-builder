import 'server-only';
import { nanoid } from 'nanoid';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getProScope, type ProScope } from '@/lib/pro/scope';
import {
  toSharedPieces,
  toSharedDetail,
  type CalendarShareLink,
  type SharedPiece,
  type SharedPieceDetail,
} from '@/lib/calendar/sharedCalendar';

export type { CalendarShareLink };

/**
 * Calendar share links — the owner's side (create / read / revoke) and the
 * client's side (resolve a token into a live, read-only calendar).
 *
 * The client's reads go through the SECURITY DEFINER functions from migrations
 * 029/032 rather than through table reads: the token is the only secret, and it
 * can only be checked where it can be passed as an argument. Nothing in here
 * uses the service-role key, so an anon page never gets a client that can see
 * more than the token names.
 *
 * A link belongs to ONE blogger (migration 032). Under Ruta Pro a single
 * operator account holds several, so "share my calendar" without a blogger on it
 * means "show this client every client's plan" — which is exactly what it did
 * before 032. Every function here therefore resolves the active scope first and
 * scopes the link to it, the same way `applyScope` scopes every other read.
 */

/** Which blogger a link is for, derived from the request's Pro scope. */
type LinkScope =
  | { ok: true; projectId: string | null }
  /** The operator is in "All bloggers" — there is no single plan to share. */
  | { ok: false; reason: 'pick_blogger' };

function scopeToLink(scope: ProScope): LinkScope {
  if (scope.kind === 'project') return { ok: true, projectId: scope.projectId };
  if (scope.kind === 'personal') return { ok: true, projectId: null };
  return { ok: false, reason: 'pick_blogger' };
}

/**
 * A link row's blogger filter, as a PostgREST filter string.
 *
 * `project_id=is.null` and `project_id=eq.<id>` are different operators, so this
 * is applied with `.or(...)` — a single-arm `or` — rather than a generic helper
 * that takes the query builder, which pushed Supabase's builder generics into an
 * infinitely deep instantiation.
 */
function blogger(projectId: string | null): string {
  return projectId === null ? 'project_id.is.null' : `project_id.eq.${projectId}`;
}

type LinkRow = {
  id: string;
  token: string;
  title: string | null;
  note: string | null;
  revoked: boolean;
  created_at: string;
};

const LINK_COLS = 'id,token,title,note,revoked,created_at';

function rowToLink(row: LinkRow): CalendarShareLink {
  return {
    id: row.id,
    token: row.token,
    title: row.title,
    note: row.note,
    revoked: row.revoked,
    createdAt: row.created_at,
  };
}

/**
 * The active blogger's calendar link, or null if they have none.
 *
 * Per BLOGGER, not per account: switching the Pro switcher to another blogger
 * shows that blogger's own link, because handing two clients the same URL is the
 * bug this whole scoping exists to prevent.
 */
export async function getMyCalendarShareLink(): Promise<CalendarShareLink | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const scoped = scopeToLink(await getProScope());
  if (!scoped.ok) return null; // "All bloggers" has no single link

  const { data } = await supabase
    .from('calendar_share_links')
    .select(LINK_COLS)
    .eq('owner_user_id', user.id)
    .eq('revoked', false)
    .or(blogger(scoped.projectId))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<LinkRow>();

  return data ? rowToLink(data) : null;
}

/** Whether the current scope can be shared at all (false in "All bloggers"). */
export async function canShareCalendar(): Promise<boolean> {
  return scopeToLink(await getProScope()).ok;
}

/**
 * Create a link, or return the one that already exists — the button the owner
 * presses is "share my calendar", not "make a second link".
 */
export async function ensureCalendarShareLink(
  title?: string | null,
): Promise<CalendarShareLink | null> {
  const existing = await getMyCalendarShareLink();
  if (existing) return existing;
  return createCalendarShareLink(title ?? null);
}

/** Mint a fresh token, revoking every previous link (old links stop resolving). */
export async function regenerateCalendarShareLink(
  title?: string | null,
): Promise<CalendarShareLink | null> {
  const previous = await getMyCalendarShareLink();
  await revokeCalendarShareLink();
  return createCalendarShareLink(title ?? previous?.title ?? null, previous?.note ?? null);
}

async function createCalendarShareLink(
  title: string | null,
  note: string | null = null,
): Promise<CalendarShareLink | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // The blogger is stamped at creation, from the same scope the plan page is
  // showing. A link with no blogger on it is a link to everything.
  const scoped = scopeToLink(await getProScope());
  if (!scoped.ok) return null;

  const { data, error } = await supabase
    .from('calendar_share_links')
    .insert({
      owner_user_id: user.id,
      token: nanoid(24),
      project_id: scoped.projectId,
      title: title?.trim() || null,
      note: note?.trim() || null,
    })
    .select(LINK_COLS)
    .single<LinkRow>();

  if (error || !data) {
    console.error('[calendar-share] create failed:', error?.message);
    return null;
  }
  return rowToLink(data);
}

/** Turn the link off. The client's page 404s from the next request on. */
export async function revokeCalendarShareLink(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // Only THIS blogger's link — revoking must not silently kill the links you
  // handed to your other clients.
  const scoped = scopeToLink(await getProScope());
  if (!scoped.ok) return false;

  const { error } = await supabase
    .from('calendar_share_links')
    .update({ revoked: true, updated_at: new Date().toISOString() })
    .eq('owner_user_id', user.id)
    .eq('revoked', false)
    .or(blogger(scoped.projectId));

  if (error) {
    console.error('[calendar-share] revoke failed:', error.message);
    return false;
  }
  return true;
}

/** Update what the client sees at the top of the shared page. */
export async function updateCalendarShareHeader(
  title: string | null,
  note: string | null,
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const scoped = scopeToLink(await getProScope());
  if (!scoped.ok) return false;

  const { error } = await supabase
    .from('calendar_share_links')
    .update({
      title: title?.trim() || null,
      note: note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_user_id', user.id)
    .eq('revoked', false)
    .or(blogger(scoped.projectId));

  return !error;
}

export type SharedCalendar = {
  token: string;
  title: string | null;
  note: string | null;
  pieces: SharedPiece[];
};

/**
 * Resolve a token into the calendar behind it. Returns null for an unknown or
 * revoked token, which is what makes the public page 404.
 */
export async function getSharedCalendar(token: string): Promise<SharedCalendar | null> {
  if (!token) return null;
  const supabase = await createServerSupabaseClient();

  // Through the function, not the table: the table has no anon read policy, on
  // purpose — one that allowed the client to read its own row would also let
  // anyone list every other user's token (see migration 029).
  const { data: meta } = await supabase.rpc('calendar_share_meta', { p_token: token });
  const link = meta as { token?: string; title?: string | null; note?: string | null } | null;
  if (!link?.token) return null;

  const { data, error } = await supabase.rpc('calendar_share_pieces', { p_token: token });
  const header = { token: link.token, title: link.title ?? null, note: link.note ?? null };
  if (error) {
    // The link resolves, so the page still opens — with an empty month rather
    // than a 404, which would read as "this link is dead".
    console.error('[calendar-share] pieces failed:', error.message);
    return { ...header, pieces: [] };
  }

  return { ...header, pieces: toSharedPieces((data ?? []) as Record<string, unknown>[]) };
}

/** One piece of a shared calendar, in full. Null when the token can't open it. */
export async function getSharedPiece(
  token: string,
  refTable: string,
  id: string,
): Promise<SharedPieceDetail | null> {
  if (!token || !refTable || !id) return null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('calendar_share_piece', {
    p_token: token,
    p_ref_table: refTable,
    p_id: id,
  });
  if (error) {
    console.error('[calendar-share] piece failed:', error.message);
    return null;
  }
  return toSharedDetail(data);
}
