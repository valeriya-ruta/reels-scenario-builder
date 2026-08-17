import 'server-only';
import { nanoid } from 'nanoid';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
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
 * The client's reads go through the two SECURITY DEFINER functions from
 * migration 029 rather than through table reads: the token is the only secret,
 * and it can only be checked where it can be passed as an argument. Nothing in
 * here uses the service-role key, so an anon page never gets a client that can
 * see more than the token names.
 */

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

/** The signed-in user's active calendar link, or null if they have none. */
export async function getMyCalendarShareLink(): Promise<CalendarShareLink | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('calendar_share_links')
    .select(LINK_COLS)
    .eq('owner_user_id', user.id)
    .eq('revoked', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<LinkRow>();

  return data ? rowToLink(data) : null;
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

  const { data, error } = await supabase
    .from('calendar_share_links')
    .insert({
      owner_user_id: user.id,
      token: nanoid(24),
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

  const { error } = await supabase
    .from('calendar_share_links')
    .update({ revoked: true, updated_at: new Date().toISOString() })
    .eq('owner_user_id', user.id)
    .eq('revoked', false);

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

  const { error } = await supabase
    .from('calendar_share_links')
    .update({
      title: title?.trim() || null,
      note: note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_user_id', user.id)
    .eq('revoked', false);

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
