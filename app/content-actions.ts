'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { isValidStatus, type ContentStatus, type ContentType } from '@/lib/content/statusSystem';
import type { ContentPiece } from '@/lib/content/contentList';

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
  return { ok: true };
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
  return { ok: true };
}
