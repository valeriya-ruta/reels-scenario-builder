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

  // Membership lives in reel_share_items, so this finds the reel's link whether
  // it was shared on its own or as one of fifteen.
  const { data } = await supabase
    .from('reel_share_links')
    .select('token,note,revoked,reel_share_items!inner(reel_id)')
    .eq('owner_user_id', user.id)
    .eq('revoked', false)
    .eq('reel_share_items.reel_id', reelId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<LinkRow>();

  return data ? { token: data.token, note: data.note, revoked: data.revoked } : null;
}

export async function ensureReelShareLink(reelId: string): Promise<ReelShareLink | null> {
  const existing = await getReelShareLink(reelId);
  if (existing) return existing;
  return createReelShareSet([reelId], null);
}

/**
 * One link for several reels — fifteen prepared reels should be one URL to send,
 * not fifteen to keep track of. A single-reel link is simply a set of one, so
 * there is one code path and one page.
 */
export async function createReelShareSet(
  reelIds: string[],
  title: string | null,
): Promise<ReelShareLink | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || reelIds.length === 0) return null;

  // Ownership is re-checked here rather than trusted: the ids came from the
  // browser, and a link must never be able to name someone else's reel.
  const { data: owned } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .in('id', reelIds);
  const ownedIds = (owned ?? []).map((r: { id: string }) => r.id);
  if (ownedIds.length === 0) return null;

  const { data: link, error } = await supabase
    .from('reel_share_links')
    .insert({
      owner_user_id: user.id,
      token: nanoid(24),
      title,
      reel_id: ownedIds.length === 1 ? ownedIds[0] : null,
    })
    .select('id,token,note,revoked')
    .single<LinkRow & { id: string }>();

  if (error || !link) {
    console.error('[reel-share] create set failed:', error?.message);
    return null;
  }

  // Keep the order the user picked them in.
  const ordered = reelIds.filter((id) => ownedIds.includes(id));
  const { error: itemsError } = await supabase
    .from('reel_share_items')
    .insert(ordered.map((reelId, i) => ({ link_id: link.id, reel_id: reelId, order_index: i })));

  if (itemsError) {
    console.error('[reel-share] set items failed:', itemsError.message);
    return null;
  }
  return { token: link.token, note: link.note, revoked: link.revoked };
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

  // Membership is in the join table now, so find the links that carry this reel
  // rather than matching the legacy `reel_id` column, which is null on a set.
  const { data: links } = await supabase
    .from('reel_share_items')
    .select('link_id')
    .eq('reel_id', reelId);
  const ids = (links ?? []).map((r: { link_id: string }) => r.link_id);
  if (ids.length === 0) return true;

  const { error } = await supabase
    .from('reel_share_links')
    .update({ revoked: true, updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('owner_user_id', user.id)
    .eq('revoked', false);

  return !error;
}

export type SharedReel = {
  id: string;
  title: string;
  scheduledDate: string | null;
  /** The reel's own sound — the editor is told it once, not per block. */
  defaultAudio: string | null;
  blocks: ReelBlock[];
};

/** What a token opens: one reel or fifteen, same shape either way. */
export type SharedReelSet = {
  title: string | null;
  note: string | null;
  reels: SharedReel[];
  /** Keys already ticked off, so the page renders them on load. */
  done: string[];
};

/** Resolve a token into the reels behind it. Null for unknown or revoked. */
export async function getSharedReelSet(token: string): Promise<SharedReelSet | null> {
  if (!token) return null;
  const supabase = await createServerSupabaseClient();

  const [viewRes, progressRes] = await Promise.all([
    supabase.rpc('reel_share_view', { p_token: token }),
    supabase.rpc('reel_share_progress_view', { p_token: token }),
  ]);

  if (viewRes.error) {
    console.error('[reel-share] view failed:', viewRes.error.message);
    return null;
  }
  const doc = viewRes.data as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') return null;

  const rawReels = Array.isArray(doc.reels) ? doc.reels : [];
  const rawDone = Array.isArray(progressRes.data) ? progressRes.data : [];

  return {
    title: typeof doc.title === 'string' ? doc.title : null,
    note: typeof doc.note === 'string' ? doc.note : null,
    reels: rawReels.map((r) => {
      const reel = r as Record<string, unknown>;
      const blocks = Array.isArray(reel.blocks) ? reel.blocks : [];
      return {
        id: String(reel.id ?? ''),
        title: typeof reel.title === 'string' ? reel.title : '',
        scheduledDate:
          typeof reel.scheduledDate === 'string' ? reel.scheduledDate.slice(0, 10) : null,
        defaultAudio: typeof reel.defaultAudio === 'string' ? reel.defaultAudio : null,
        // The same parser the builder uses, so the shared page cannot read a
        // block differently from the screen it was written on.
        blocks: blocks.map((b) => toReelBlock(b as Record<string, unknown>)),
      };
    }),
    done: rawDone.filter((k): k is string => typeof k === 'string'),
  };
}

/** Tick something off, as the client. The token decides what may be touched. */
export async function setSharedProgress(
  token: string,
  blockId: string,
  slot: string,
  done: boolean,
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('reel_share_set_progress', {
    p_token: token,
    p_block_id: blockId,
    p_slot: slot,
    p_done: done,
  });
  if (error) {
    console.error('[reel-share] progress failed:', error.message);
    return false;
  }
  return data === true;
}

/** What the OWNER sees on her own builder: what the blogger has already done. */
export async function getOwnerProgress(reelId: string): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('reel_progress_for_owner', { p_reel_id: reelId });
  if (error || !Array.isArray(data)) return [];
  return data.filter((k): k is string => typeof k === 'string');
}
