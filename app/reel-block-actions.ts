'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { REEL_BLOCK_COLUMNS, toReelBlock, type ReelBlock } from '@/lib/reels/blocks';
import { findPreset } from '@/lib/reels/presets';
import {
  createReelShareSet,
  ensureReelShareLink,
  regenerateReelShareLink,
  revokeReelShareLink,
} from '@/lib/reels/share';

/**
 * Reel blocks — the writes behind the builder.
 *
 * Ownership is never taken from the client: every statement is filtered by the
 * parent reel's `user_id`, and `reel_blocks`' own RLS (migration 033) checks the
 * same thing again at the database. Passing a block id that belongs to someone
 * else updates nothing rather than erroring, which is the behaviour the builder
 * wants anyway.
 */

const COLS = REEL_BLOCK_COLUMNS;

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
  clips: unknown;
  images: unknown;
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

/**
 * Copy a block, right below the original.
 *
 * Reels repeat: three cutaways shot the same way, two takes with the same
 * framing note. Rebuilding one field by field is the kind of work the app is
 * supposed to remove. Overlays and clips get fresh ids — sharing them would
 * make two blocks tick each other's boxes off, since progress is keyed by id.
 */
export async function duplicateReelBlock(
  blockId: string,
): Promise<{ ok: true; block: ReelBlock } | { ok: false }> {
  const user = await requireAuth();
  if (!user) return { ok: false };
  const supabase = await createServerSupabaseClient();

  const { data: owned } = await supabase.from('projects').select('id').eq('user_id', user.id);
  const ids = (owned ?? []).map((p: { id: string }) => p.id);
  if (ids.length === 0) return { ok: false };

  const { data: source } = await supabase
    .from('reel_blocks')
    .select(COLS)
    .eq('id', blockId)
    .in('project_id', ids)
    .maybeSingle();
  if (!source) return { ok: false };

  const row = source as Record<string, unknown>;
  const freshId = () => `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  const overlays = (Array.isArray(row.overlays) ? row.overlays : []).map((o) => ({
    ...(o as Record<string, unknown>),
    id: `ov_${freshId()}`,
  }));
  const clips = (Array.isArray(row.clips) ? row.clips : []).map((c) => ({
    ...(c as Record<string, unknown>),
    id: `cl_${freshId()}`,
  }));

  const projectId = String(row.project_id);
  const at = typeof row.order_index === 'number' ? row.order_index : 0;

  const { data: created, error } = await supabase
    .from('reel_blocks')
    .insert({
      project_id: projectId,
      order_index: at + 1,
      kind: row.kind,
      speaker: row.speaker,
      spoken: row.spoken,
      screen_text: row.screen_text,
      record_note: row.record_note,
      asset_kind: row.asset_kind,
      asset_note: row.asset_note,
      asset_url: row.asset_url,
      edit_note: row.edit_note,
      overlays,
      clips,
      images: row.images ?? [],
      audio_source: row.audio_source,
      duration_sec: row.duration_sec,
    })
    .select(COLS)
    .single();

  if (error || !created) {
    console.error('[reel-blocks] duplicate failed:', error?.message);
    return { ok: false };
  }

  // Everything that was below the original moves down one, so the copy has a
  // place rather than a shared index.
  const { data: after } = await supabase
    .from('reel_blocks')
    .select('id,order_index')
    .eq('project_id', projectId)
    .gt('order_index', at)
    .neq('id', (created as { id: string }).id)
    .order('order_index', { ascending: true });

  await Promise.all(
    (after ?? []).map((r: { id: string; order_index: number }, i) =>
      supabase
        .from('reel_blocks')
        .update({ order_index: at + 2 + i })
        .eq('id', r.id)
        .eq('project_id', projectId),
    ),
  );

  return { ok: true, block: toReelBlock(created as Record<string, unknown>) };
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

/** «Про що цей рілс» — the brief the client reads first (migration 044). */
export async function setReelOverview(
  projectId: string,
  overview: string,
): Promise<{ ok: boolean }> {
  const user = await requireAuth();
  if (!user) return { ok: false };
  const supabase = await createServerSupabaseClient();
  const trimmed = overview.trim();
  const { error } = await supabase
    .from('projects')
    .update({ overview: trimmed ? trimmed.slice(0, 2000) : null })
    .eq('id', projectId)
    .eq('user_id', user.id);
  if (error) {
    console.error('[reel-blocks] overview failed:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

/** Reel-wide references — the links and pictures that belong to the whole
 *  thing rather than to one beat (migration 047). */
export async function setReelReferences(
  projectId: string,
  references: { id: string; url: string; note?: string }[],
): Promise<{ ok: boolean }> {
  const user = await requireAuth();
  if (!user) return { ok: false };
  const supabase = await createServerSupabaseClient();
  // Only http(s) is stored: a `javascript:` "reference" would be rendered on a
  // page that gets sent to other people.
  const clean = references
    .filter((r) => typeof r?.url === 'string' && /^https?:\/\//i.test(r.url.trim()))
    .slice(0, 40)
    .map((r) => ({ id: String(r.id), url: r.url.trim(), ...(r.note ? { note: String(r.note).slice(0, 200) } : {}) }));

  const { error } = await supabase
    .from('projects')
    .update({ reference_media: clean })
    .eq('id', projectId)
    .eq('user_id', user.id);
  if (error) {
    console.error('[reel-blocks] references failed:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

/** The reel's own sound — what every block falls back to (migration 043). */
export async function setReelDefaultAudio(
  projectId: string,
  audio: string | null,
): Promise<{ ok: boolean }> {
  const user = await requireAuth();
  if (!user) return { ok: false };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('projects')
    .update({ default_audio_source: audio })
    .eq('id', projectId)
    .eq('user_id', user.id);
  if (error) {
    console.error('[reel-blocks] reel audio failed:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

// ── Sharing one reel ────────────────────────────────────────────────────────

export type ReelShareResult = { ok: true; token: string } | { ok: false };

export async function createReelShareLinkAction(reelId: string): Promise<ReelShareResult> {
  const link = await ensureReelShareLink(reelId);
  return link ? { ok: true, token: link.token } : { ok: false };
}

export async function regenerateReelShareLinkAction(reelId: string): Promise<ReelShareResult> {
  const link = await regenerateReelShareLink(reelId);
  return link ? { ok: true, token: link.token } : { ok: false };
}

export async function revokeReelShareLinkAction(reelId: string): Promise<{ ok: boolean }> {
  return { ok: await revokeReelShareLink(reelId) };
}

/**
 * One link for a whole batch. Fifteen prepared reels are one thing to send, not
 * fifteen — ownership of every id is re-checked server-side, since the list came
 * from the browser.
 */
export async function createReelSetShareLinkAction(
  reelIds: string[],
  title: string | null,
): Promise<ReelShareResult> {
  const link = await createReelShareSet(reelIds, title);
  return link ? { ok: true, token: link.token } : { ok: false };
}
