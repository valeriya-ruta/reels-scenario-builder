'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { isValidStatus, type ContentStatus, type ContentType } from '@/lib/content/statusSystem';
import { NEW_LABELS } from '@/lib/content/displayTitle';
import type { ContentPiece } from '@/lib/content/contentList';
import { getProScope, insertProjectId } from '@/lib/pro/scope';

/**
 * Every surface reads the same object from the same `content_pieces` view, so a
 * write must invalidate ALL of them, not the page that happened to trigger it
 * (Prompt 9). Without this the RSC payload for Home / План / Розбір / Інсайти
 * stayed cached and kept re-serving the pre-change status after a navigation.
 */
function revalidateContentSurfaces(): void {
  revalidatePath('/', 'layout');
}

const ALLOWED_TABLES: ReadonlyArray<ContentPiece['refTable']> = [
  'carousel_projects',
  'projects',
  'storytelling_projects',
  'ideas',
];

/**
 * Set a content piece's status (Status system 4/8). Writes to the underlying
 * table the piece lives in (identified by ref_table), enforcing both ownership
 * (user_id) and track validity (status must be valid for the piece's type).
 */
export async function setContentStatus(
  refTable: ContentPiece['refTable'],
  id: string,
  type: ContentType,
  status: ContentStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };
  if (!ALLOWED_TABLES.includes(refTable)) return { ok: false, error: 'BAD_TABLE' };
  if (!isValidStatus(type, status)) return { ok: false, error: 'INVALID_STATUS' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from(refTable)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[content] setContentStatus failed', { refTable, id, status, message: error.message });
    return { ok: false, error: error.message };
  }
  revalidateContentSurfaces();
  return { ok: true };
}

/**
 * Schedule (or unschedule) a content piece on the План calendar (task 86d3d23nj).
 * `date` is 'YYYY-MM-DD' to place it, or null to clear. Ownership-enforced; does
 * NOT bump updated_at (scheduling shouldn't reorder the recents list).
 */
export async function setContentScheduledDate(
  refTable: ContentPiece['refTable'],
  id: string,
  date: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };
  if (!ALLOWED_TABLES.includes(refTable)) return { ok: false, error: 'BAD_TABLE' };
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'BAD_DATE' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from(refTable)
    .update({ scheduled_date: date })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[content] setContentScheduledDate failed', { refTable, id, date, message: error.message });
    return { ok: false, error: error.message };
  }
  revalidateContentSurfaces();
  return { ok: true };
}

/**
 * Create a piece already placed on a given day (Prompt 7's «＋» on Сьогодні).
 *
 * Scheduling is part of the creation, not a second step: the whole point of the
 * affordance is «add content to TODAY», and a piece that lands undated would
 * drop straight into Розбір instead of onto the day the user asked for.
 * Returns the editor href so the caller can navigate.
 */
export async function createContentOnDate(
  type: Exclude<ContentType, 'idea'>,
  date: string,
): Promise<{ ok: true; href: string } | { ok: false; error: string }> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'BAD_DATE' };

  const supabase = await createServerSupabaseClient();
  const scope = await getProScope();
  const project_id = insertProjectId(scope);

  if (type === 'reel') {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: NEW_LABELS.reel,
        crew_mode: 'with_crew',
        project_type: 'reels',
        user_id: user.id,
        scheduled_date: date,
        project_id,
      })
      .select('id')
      .single<{ id: string }>();
    if (error || !data) return { ok: false, error: error?.message ?? 'INSERT_FAILED' };
    revalidateContentSurfaces();
    return { ok: true, href: `/project/${data.id}` };
  }

  if (type === 'carousel') {
    const { data, error } = await supabase
      .from('carousel_projects')
      .insert({ name: NEW_LABELS.carousel, user_id: user.id, scheduled_date: date, project_id })
      .select('id')
      .single<{ id: string }>();
    if (error || !data) return { ok: false, error: error?.message ?? 'INSERT_FAILED' };
    revalidateContentSurfaces();
    return { ok: true, href: `/carousel/${data.id}` };
  }

  const { data, error } = await supabase
    .from('storytelling_projects')
    .insert({ name: NEW_LABELS.story, user_id: user.id, scheduled_date: date, project_id })
    .select('id')
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: error?.message ?? 'INSERT_FAILED' };

  // A storytelling project is only usable with a column + a first story — the
  // list page's own create action does the same, and skipping it would open an
  // editor with nothing to type into.
  const { data: column } = await supabase
    .from('storytelling_columns')
    .insert({ project_id: data.id, name: 'Storytelling 1', order_index: 0 })
    .select('id')
    .single<{ id: string }>();
  if (column) {
    await supabase
      .from('storytelling_stories')
      .insert({ column_id: column.id, order_index: 0, text: '' });
  }

  revalidateContentSurfaces();
  return { ok: true, href: `/storytelling/${data.id}` };
}

/**
 * Delete a content piece from whichever table it lives in (ref_table), enforcing
 * ownership. Used by swipe-to-delete on the all-content rows (Home + «Твій
 * контент»), where pieces are a mix of types — task 86d3d2fqy.
 */
export async function deleteContentPiece(
  refTable: ContentPiece['refTable'],
  id: string,
): Promise<{ ok: boolean }> {
  const user = await requireAuth();
  if (!user) return { ok: false };
  if (!ALLOWED_TABLES.includes(refTable)) return { ok: false };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from(refTable).delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    console.error('[content] deleteContentPiece failed', { refTable, id, message: error.message });
    return { ok: false };
  }
  revalidateContentSurfaces();
  return { ok: true };
}
