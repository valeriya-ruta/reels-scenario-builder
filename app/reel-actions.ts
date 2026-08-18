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
import { aiLimit, transcribeLimit } from '@/lib/ratelimit';
import { generateCaption, rewriteReelText, type RewriteMode } from '@/lib/ai/reelText';
import { resolveReferenceMediaUrl } from '@/lib/ai/referenceMedia';
import { transcribeMediaFromUrl } from '@/lib/ai/sttProvider';
import { sanitizePipelineErrorForUser } from '@/lib/sanitizePipelineError';

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

// ── what the note's buttons do ────────────────────────────────────────────

/**
 * Rewrite the whole note, or the phrase she selected.
 *
 * Returns text, never applies it. The screen decides what to do with the
 * result, and — crucially — keeps the old text until the new one arrives, so a
 * failed call leaves her writing exactly where it was rather than blank.
 */
export async function rewriteReel(
  text: string,
  mode: RewriteMode,
): Promise<Result<{ text: string; title: string | null }>> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const source = text.trim();
  if (!source) return { ok: false, error: 'Спочатку напиши або наговори щось.' };

  const { success } = await aiLimit.limit(user.id);
  if (!success) return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };

  try {
    return { ok: true, data: await rewriteReelText(source, mode) };
  } catch (error) {
    const raw = error instanceof Error ? error.message : '';
    return { ok: false, error: sanitizePipelineErrorForUser(raw || 'Не вдалося переписати текст.') };
  }
}

/** The caption under the post, written from the script. */
export async function writeCaption(script: string): Promise<Result<{ caption: string }>> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const source = script.trim();
  if (!source) return { ok: false, error: 'Спочатку напиши текст рілсу.' };

  const { success } = await aiLimit.limit(user.id);
  if (!success) return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };

  try {
    return { ok: true, data: { caption: await generateCaption(source) } };
  } catch (error) {
    const raw = error instanceof Error ? error.message : '';
    return { ok: false, error: sanitizePipelineErrorForUser(raw || 'Не вдалося написати підпис.') };
  }
}

/** Caption and reference live on the reel itself, not on any one block. */
export async function saveReelMeta(
  projectId: string,
  patch: { caption?: string | null; referenceUrl?: string | null },
): Promise<Result> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const row: Record<string, unknown> = {};
  if ('caption' in patch) row.caption = patch.caption;
  if ('referenceUrl' in patch) row.reference_url = patch.referenceUrl;
  if (Object.keys(row).length === 0) return { ok: true };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('projects')
    .update(row)
    .eq('id', projectId)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Pull the words out of a reel someone else made.
 *
 * Returns them rather than writing them: whether they REPLACE what she has
 * written or merely sit beside it as a reference is her decision, and the
 * screen cannot ask once the text is already overwritten.
 */
export async function readReference(url: string): Promise<Result<{ text: string }>> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: NO_AUTH };

  const link = url.trim();
  if (!link) return { ok: false, error: 'Встав посилання.' };

  const tr = await transcribeLimit.limit(user.id);
  if (!tr.success) return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };

  try {
    const { mediaUrl } = await resolveReferenceMediaUrl(link);
    const transcript = await transcribeMediaFromUrl(mediaUrl);
    const text = transcript.transcript.trim();
    if (!text) return { ok: false, error: 'У цьому відео не знайшлося слів.' };
    return { ok: true, data: { text } };
  } catch (error) {
    const raw = error instanceof Error ? error.message : '';
    return {
      ok: false,
      error: sanitizePipelineErrorForUser(
        raw || 'Не вдалося обробити посилання. Перевір, що Reel публічний.',
      ),
    };
  }
}
