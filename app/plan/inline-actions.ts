'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { BLOCK_KINDS } from '@/lib/reels/blocks';
import { ENGAGEMENT_OPTIONS, VISUAL_OPTIONS } from '@/lib/domain';
import type { EditableBlock, EditableStory, RowEdits } from '@/lib/plan/editableDoc';

/**
 * Saving an edit made BESIDE the calendar, rather than inside the editor.
 *
 * The builders autosave every keystroke; this does not. The panel is a form
 * with a Save button because that is what «поправлю і збережу» means — you make
 * three changes to a reel you are looking at on Friday and commit them as one
 * act, or you back out and the reel is as it was.
 *
 * So each action takes a DIFF, not a document: the rows to insert, the rows to
 * update, the rows to delete and the order to leave them in. Sending the whole
 * document instead would mean deleting and re-creating every row on every save,
 * which would throw away each block's identity — and with it the ticks someone
 * has already made on the shared shot list.
 *
 * Ownership is proved once, on the parent, before anything is written; every
 * child statement is then scoped to that parent's own ids.
 */

type Result = { ok: true } | { ok: false; error: string };

const VISUALS = new Set<string>(VISUAL_OPTIONS);
const ENGAGEMENTS = new Set<string>(ENGAGEMENT_OPTIONS);
const KINDS = new Set<string>(BLOCK_KINDS);

/** Trim, cap, and turn "nothing typed" into a null rather than an empty string. */
function nullable(value: string | null | undefined, max = 4000): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function storyColumns(rows: unknown): string[] {
  return ((rows ?? []) as { id: string }[]).map((r) => r.id);
}

async function ownsRow(
  supabase: SupabaseClient,
  table: 'projects' | 'storytelling_projects',
  id: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase.from(table).select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  return !!data;
}

/**
 * Every surface reads one object, so a write here has to invalidate all of them
 * — the same rule the rest of the content writes follow.
 */
function revalidateEverything(): void {
  revalidatePath('/', 'layout');
}

// ── storytelling ────────────────────────────────────────────────────────────

export async function saveInlineStory(
  projectId: string,
  name: string,
  columnId: string | null,
  edits: RowEdits<EditableStory>,
): Promise<Result> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  const supabase = await createServerSupabaseClient();
  if (!(await ownsRow(supabase, 'storytelling_projects', projectId, user.id))) {
    return { ok: false, error: 'NOT_FOUND' };
  }

  const { data: columnRows } = await supabase
    .from('storytelling_columns')
    .select('id')
    .eq('project_id', projectId)
    .order('order_index', { ascending: true });
  let columns = storyColumns(columnRows);

  // A storytelling with no column cannot hold a story. That only happens to
  // rows created before the column was part of creation, but it is cheap to
  // heal rather than refuse the save.
  let target = columnId && columns.includes(columnId) ? columnId : columns[0] ?? null;
  if (!target) {
    const { data: created, error } = await supabase
      .from('storytelling_columns')
      .insert({ project_id: projectId, name: 'Storytelling 1', order_index: 0 })
      .select('id')
      .single<{ id: string }>();
    if (error || !created) return { ok: false, error: error?.message ?? 'COLUMN_FAILED' };
    target = created.id;
    columns = [created.id];
  }

  if (edits.created.length > 0) {
    const { error } = await supabase.from('storytelling_stories').insert(
      edits.created.map((s) => ({
        id: s.id,
        column_id: target,
        order_index: s.orderIndex,
        text: s.text.slice(0, 8000),
        visual: s.visual && VISUALS.has(s.visual) ? s.visual : null,
        engagement: s.engagement && ENGAGEMENTS.has(s.engagement) ? s.engagement : null,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  for (const story of edits.updated) {
    const { error } = await supabase
      .from('storytelling_stories')
      .update({
        text: story.text.slice(0, 8000),
        visual: story.visual && VISUALS.has(story.visual) ? story.visual : null,
        engagement: story.engagement && ENGAGEMENTS.has(story.engagement) ? story.engagement : null,
      })
      .eq('id', story.id)
      .in('column_id', columns);
    if (error) return { ok: false, error: error.message };
  }

  if (edits.deleted.length > 0) {
    const { error } = await supabase
      .from('storytelling_stories')
      .delete()
      .in('id', edits.deleted)
      .in('column_id', columns);
    if (error) return { ok: false, error: error.message };
  }

  if (edits.order) {
    // Written one row at a time on purpose: the cards may legitimately span
    // several columns on a board built before this panel existed, and each row
    // keeps whichever column it already belongs to.
    await Promise.all(
      edits.order.map((id, index) =>
        supabase
          .from('storytelling_stories')
          .update({ order_index: index })
          .eq('id', id)
          .in('column_id', columns),
      ),
    );
  }

  const cleanName = nullable(name, 200);
  if (cleanName) {
    await supabase
      .from('storytelling_projects')
      .update({ name: cleanName, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', user.id);
  }

  revalidateEverything();
  return { ok: true };
}

// ── reel ────────────────────────────────────────────────────────────────────

export async function saveInlineReel(
  projectId: string,
  name: string,
  overview: string,
  edits: RowEdits<EditableBlock>,
): Promise<Result> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  const supabase = await createServerSupabaseClient();
  if (!(await ownsRow(supabase, 'projects', projectId, user.id))) {
    return { ok: false, error: 'NOT_FOUND' };
  }

  // Only the fields this panel shows are ever written. A cutaway's clips, its
  // overlays, its pasted reference pictures and its per-block sound all stay
  // exactly as the full editor left them — the panel edits a reel, it does not
  // replace one.
  const blockColumns = (b: EditableBlock) => ({
    kind: KINDS.has(b.kind) ? b.kind : 'talk',
    speaker: nullable(b.speaker, 200),
    spoken: nullable(b.spoken, 8000),
    screen_text: nullable(b.screenText, 2000),
    record_note: nullable(b.recordNote, 2000),
    asset_note: nullable(b.assetNote, 2000),
    edit_note: nullable(b.editNote, 2000),
  });

  if (edits.created.length > 0) {
    const { error } = await supabase.from('reel_blocks').insert(
      edits.created.map((b) => ({
        id: b.id,
        project_id: projectId,
        order_index: b.orderIndex,
        ...blockColumns(b),
        // Mirrors the builder: a cutaway exists to carry the voice over it.
        ...(b.kind === 'broll' ? { asset_kind: 'film', audio_source: 'voiceover' } : {}),
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  for (const block of edits.updated) {
    const { error } = await supabase
      .from('reel_blocks')
      .update(blockColumns(block))
      .eq('id', block.id)
      .eq('project_id', projectId);
    if (error) return { ok: false, error: error.message };
  }

  if (edits.deleted.length > 0) {
    const { error } = await supabase
      .from('reel_blocks')
      .delete()
      .in('id', edits.deleted)
      .eq('project_id', projectId);
    if (error) return { ok: false, error: error.message };
  }

  if (edits.order) {
    await Promise.all(
      edits.order.map((id, index) =>
        supabase
          .from('reel_blocks')
          .update({ order_index: index })
          .eq('id', id)
          .eq('project_id', projectId),
      ),
    );
  }

  const cleanName = nullable(name, 200);
  const { error } = await supabase
    .from('projects')
    .update({
      ...(cleanName ? { name: cleanName } : {}),
      overview: nullable(overview, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidateEverything();
  return { ok: true };
}
