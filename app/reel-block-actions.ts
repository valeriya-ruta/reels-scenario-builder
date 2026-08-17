'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { toReelBlock, type ReelBlock } from '@/lib/reels/blocks';
import { findPreset } from '@/lib/reels/presets';

/**
 * Reel blocks — the writes behind the builder.
 *
 * Ownership is never taken from the client: every statement is filtered by the
 * parent reel's `user_id`, and `reel_blocks`' own RLS (migration 033) checks the
 * same thing again at the database. Passing a block id that belongs to someone
 * else updates nothing rather than erroring, which is the behaviour the builder
 * wants anyway.
 */

const COLS =
  'id,project_id,order_index,kind,speaker,spoken,screen_text,record_note,asset_kind,asset_note,asset_url,edit_note,overlays,audio_source,duration_sec';

/** Does this reel belong to the signed-in user? */
async function ownsReel(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

export async function listReelBlocks(projectId: string): Promise<ReelBlock[]> {
  const user = await requireAuth();
  if (!user) return [];
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('reel_blocks')
    .select(COLS)
    .eq('project_id', projectId)
    .order('order_index', { ascending: true });
  return (data ?? []).map((r) => toReelBlock(r as Record<string, unknown>));
}

export type BlockPatch = Partial<{
  kind: string;
  speaker: string | null;
  spoken: string | null;
  screen_text: string | null;
  record_note: string | null;
  asset_kind: string | null;
  asset_note: string | null;
  asset_url: string | null;
  edit_note: string | null;
  overlays: unknown;
  audio_source: string | null;
  duration_sec: number | null;
}>;

export async function updateReelBlock(blockId: string, patch: BlockPatch): Promise<{ ok: boolean }> {
  const user = await requireAuth();
  if (!user) return { ok: false };
  const supabase = await createServerSupabaseClient();

  // Scope by the parent reel's owner. `in` on a sub-select keeps it one
  // round-trip while still refusing a block id from another account.
  const { data: owned } = await supabase.from('projects').select('id').eq('user_id', user.id);
  const ids = (owned ?? []).map((p: { id: string }) => p.id);
  if (ids.length === 0) return { ok: false };

  const { error } = await supabase
    .from('reel_blocks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', blockId)
    .in('project_id', ids);

  if (error) {
    console.error('[reel-blocks] update failed:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

export async function addReelBlock(
  projectId: string,
  kind: string,
  orderIndex: number,
  blockId?: string,
): Promise<{ ok: true; block: ReelBlock } | { ok: false }> {
  const user = await requireAuth();
  if (!user) return { ok: false };
  const supabase = await createServerSupabaseClient();
  if (!(await ownsReel(supabase, user.id, projectId))) return { ok: false };

  const insert: Record<string, unknown> = {
    project_id: projectId,
    kind,
    order_index: orderIndex,
    // Mirrors `emptyBlock`: a cutaway is for carrying the voice over it.
    ...(kind === 'broll' ? { asset_kind: 'film', audio_source: 'voiceover' } : {}),
  };
  if (blockId) insert.id = blockId;

  const { data, error } = await supabase.from('reel_blocks').insert(insert).select(COLS).single();
  if (error || !data) {
    console.error('[reel-blocks] insert failed:', error?.message);
    return { ok: false };
  }
  return { ok: true, block: toReelBlock(data as Record<string, unknown>) };
}

export async function deleteReelBlock(blockId: string): Promise<{ ok: boolean }> {
  const user = await requireAuth();
  if (!user) return { ok: false };
  const supabase = await createServerSupabaseClient();
  const { data: owned } = await supabase.from('projects').select('id').eq('user_id', user.id);
  const ids = (owned ?? []).map((p: { id: string }) => p.id);
  if (ids.length === 0) return { ok: false };

  const { error } = await supabase.from('reel_blocks').delete().eq('id', blockId).in('project_id', ids);
  return { ok: !error };
}

/** Persist a new order. The client has already moved the block on screen. */
export async function reorderReelBlocks(projectId: string, orderedIds: string[]): Promise<{ ok: boolean }> {
  const user = await requireAuth();
  if (!user) return { ok: false };
  const supabase = await createServerSupabaseClient();
  if (!(await ownsReel(supabase, user.id, projectId))) return { ok: false };

  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('reel_blocks').update({ order_index: i }).eq('id', id).eq('project_id', projectId),
    ),
  );
  return { ok: true };
}

/**
 * Drop a preset's blocks in.
 *
 * Appends rather than replaces: a preset is a starting shape, and silently
 * deleting what someone already wrote to apply one would be the worst possible
 * reading of "give me a dialogue". Clearing is the user's own explicit action.
 */
export async function applyReelPreset(
  projectId: string,
  presetId: string,
): Promise<{ ok: true; blocks: ReelBlock[] } | { ok: false }> {
  const user = await requireAuth();
  if (!user) return { ok: false };
  const preset = findPreset(presetId);
  if (!preset) return { ok: false };

  const supabase = await createServerSupabaseClient();
  if (!(await ownsReel(supabase, user.id, projectId))) return { ok: false };

  const { count } = await supabase
    .from('reel_blocks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  const start = count ?? 0;

  const rows = preset.blocks.map((b, i) => ({
    project_id: projectId,
    order_index: start + i,
    kind: b.kind,
    speaker: b.speaker ?? null,
    asset_kind: b.assetKind ?? null,
    audio_source: b.audioSource ?? null,
    record_note: b.recordNote ?? null,
  }));

  const { data, error } = await supabase.from('reel_blocks').insert(rows).select(COLS);
  if (error || !data) {
    console.error('[reel-blocks] preset failed:', error?.message);
    return { ok: false };
  }
  return { ok: true, blocks: data.map((r) => toReelBlock(r as Record<string, unknown>)) };
}
