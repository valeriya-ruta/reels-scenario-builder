import 'server-only';
import { nanoid } from 'nanoid';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { toReelBlock, type ReelBlock } from '@/lib/reels/blocks';

/**
 * Per-reel share links (migration 035).
 *
 * The calendar link answers "what is planned this month"; this one answers
 * "here is the reel we're shooting" — what you send when there is nothing to
 * plan, only something to film.
 *
 * The client's read goes through `reel_share_view`, which takes the token as an
 * argument, because a policy cannot see a token: an anon-readable link table
 * would hand out every token to anyone who queried it (see migration 029).
 */

export type ReelShareLink = {
  token: string;
  note: string | null;
  revoked: boolean;
};

type LinkRow = { token: string; note: string | null; revoked: boolean };

/** This reel's active link, or null. One per reel — pressing share twice
 *  returns the same URL rather than minting a second one to keep track of. */
export async function getReelShareLink(reelId: string): Promise<ReelShareLink | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('reel_share_links')
    .select('token,note,revoked')
    .eq('reel_id', reelId)
    .eq('owner_user_id', user.id)
    .eq('revoked', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<LinkRow>();

  return data ?? null;
}

export async function ensureReelShareLink(reelId: string): Promise<ReelShareLink | null> {
  const existing = await getReelShareLink(reelId);
  if (existing) return existing;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // The reel must be the caller's own — never take ownership from the client.
  const { data: reel } = await supabase
    .from('projects')
    .select('id')
    .eq('id', reelId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!reel) return null;

  const { data, error } = await supabase
    .from('reel_share_links')
    .insert({ reel_id: reelId, owner_user_id: user.id, token: nanoid(24) })
    .select('token,note,revoked')
    .single<LinkRow>();

  if (error || !data) {
    console.error('[reel-share] create failed:', error?.message);
    return null;
  }
  return data;
}

/** Mint a fresh token; the old link stops resolving immediately. */
export async function regenerateReelShareLink(reelId: string): Promise<ReelShareLink | null> {
  await revokeReelShareLink(reelId);
  return ensureReelShareLink(reelId);
}

export async function revokeReelShareLink(reelId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('reel_share_links')
    .update({ revoked: true, updated_at: new Date().toISOString() })
    .eq('reel_id', reelId)
    .eq('owner_user_id', user.id)
    .eq('revoked', false);

  return !error;
}

export type SharedReel = {
  title: string;
  note: string | null;
  scheduledDate: string | null;
  blocks: ReelBlock[];
};

/** Resolve a token into the reel behind it. Null for unknown or revoked. */
export async function getSharedReel(token: string): Promise<SharedReel | null> {
  if (!token) return null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('reel_share_view', { p_token: token });
  if (error) {
    console.error('[reel-share] view failed:', error.message);
    return null;
  }
  const doc = data as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') return null;

  const rawBlocks = Array.isArray(doc.blocks) ? doc.blocks : [];
  return {
    title: typeof doc.title === 'string' ? doc.title : '',
    note: typeof doc.note === 'string' ? doc.note : null,
    scheduledDate: typeof doc.scheduledDate === 'string' ? doc.scheduledDate.slice(0, 10) : null,
    // The same parser the builder uses, so the shared page cannot read a block
    // differently from the screen it was written on.
    blocks: rawBlocks.map((r) => toReelBlock(r as Record<string, unknown>)),
  };
}
