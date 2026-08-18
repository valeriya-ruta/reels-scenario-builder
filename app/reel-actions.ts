'use server';

/**
 * Reading and writing a reel as BLOCKS.
 *
 * The customer editor moved off `scenes` and onto `reel_blocks` — the table the
 * operator edition already reads — so the two editions derive the same shot
 * list and editing list from the same rows and cannot drift apart.
 *
 * `scenes` is deliberately left alone. Migration 036 mirrors scenes INTO blocks
 * with a trigger, so the AI paths that still write scenes keep working; nothing
 * mirrors back, and writing both would be two authors for one sentence, which is
 * how text quietly diverges.
 *
 * Every column named here comes from the model's own constants
 * (`REEL_BLOCK_COLUMNS`, `toBlockRow`), never from a list typed out by hand.
 */

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { REEL_BLOCK_COLUMNS, toReelBlock, type BlockKind, type ReelBlock } from '@/lib/reels/blocks';
import { toBlockRow, type BlockPatch } from '@/lib/reels/blockRow';

type Result<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

const NO_AUTH = 'Необхідно увійти в акаунт.';

/**
 * Every reel block, in order.
 *
 * Ownership is enforced by RLS on `reel_blocks` (the parent project's
 * `user_id`), so this does not re-filter by user — a second filter here that
 * disagreed with the policy would be a second source of truth for who owns what.
 */
export async function loadReelBlocks(projectId: string): Promise<ReelBlock[]> {
  const user = await requireAuth();
  if (!user) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('reel_blocks')
    .select(REEL_BLOCK_COLUMNS)
    .eq('project_id', projectId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading reel blocks:', error);
    return [];
  }
  return (data ?? []).map((row) => toReelBlock(row as Record<string, unknown>));
}

/** A new block at `orderIndex`, optionally pre-filled. Returns it, with its id. */
export async function createReelBlock(
  projectId: string,
  orderIndex: number,
  kind: BlockKind = 'talk',
  patch: BlockPatch = {},
): Promise<Result<ReelBlock>> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('reel_blocks')
    .insert({
      project_id: projectId,
      order_index: orderIndex,
      kind,
      ...toBlockRow(patch),
    })
    .select(REEL_BLOCK_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Не вдалося створити блок.' };
  }
  return { ok: true, data: toReelBlock(data as Record<string, unknown>) };
}

/**
 * Change part of a block.
 *
 * Patches, never whole objects: typing the text and attaching a photo are two
 * writes that can be in flight together, and a full-object write would have the
 * slower one restore the other's stale value.
 */
export async function updateReelBlock(blockId: string, patch: BlockPatch): Promise<Result> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const row = toBlockRow(patch);
  if (Object.keys(row).length === 0) return { ok: true };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('reel_blocks')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', blockId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteReelBlock(blockId: string): Promise<Result> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('reel_blocks').delete().eq('id', blockId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Put the blocks in this order.
 *
 * Sent as the full id list rather than as "move X to position N": the client
 * already knows the order it is showing, and re-deriving it here from a move
 * would be a second implementation of the same reordering.
 */
export async function reorderReelBlocks(projectId: string, ids: string[]): Promise<Result> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const supabase = await createServerSupabaseClient();
  const stamp = new Date().toISOString();
  const results = await Promise.all(
    ids.map((id, index) =>
      supabase
        .from('reel_blocks')
        .update({ order_index: index, updated_at: stamp })
        .eq('id', id)
        .eq('project_id', projectId),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  return { ok: true };
}
