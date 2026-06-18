import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { ContentStatus, ContentType } from '@/lib/content/statusSystem';
import { contentHref, type ContentPiece } from '@/lib/content/contentPiece';

/**
 * Canonical "all content pieces for this user" read (Status system 1/8).
 *
 * Reads the unified `content_pieces` view (see migration 020), so the list page,
 * Home recents, and filter all consume one shape regardless of which underlying
 * table (carousel_projects / projects / storytelling_projects / ideas) a piece
 * lives in.
 *
 * The client-safe `ContentPiece` shape + `contentHref` live in contentPiece.ts
 * (no server-only deps) and are re-exported here for convenience.
 */
export type { ContentPiece };
export { contentHref };

type ContentPieceRow = {
  id: string;
  user_id: string;
  content_type: ContentType;
  status: ContentStatus;
  title: string | null;
  ref_table: ContentPiece['refTable'];
  created_at: string;
  updated_at: string;
};

function rowToPiece(row: ContentPieceRow): ContentPiece {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.content_type,
    status: row.status,
    title: (row.title ?? '').trim() || 'Без назви',
    refTable: row.ref_table,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * All of the current user's content pieces, most-recent-first.
 * @param limit optional cap (Home recents passes a small number; the full list omits it).
 */
export async function getAllContent(limit?: number): Promise<ContentPiece[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('content_pieces')
    .select('id,user_id,content_type,status,title,ref_table,created_at,updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (typeof limit === 'number' && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query.returns<ContentPieceRow[]>();
  if (error || !data) {
    if (error) console.error('[content] getAllContent failed:', error.message);
    return [];
  }
  const pieces = data.map(rowToPiece);

  // Attach the full idea text to idea pieces (the view only carries an 80-char
  // title) so an idea row can reopen the braindump overlay with no round-trip
  // (task 86d3czeyc). One batched query, RLS-scoped to the owner.
  const ideaIds = pieces.filter((p) => p.refTable === 'ideas').map((p) => p.id);
  if (ideaIds.length > 0) {
    const { data: ideaRows } = await supabase
      .from('ideas')
      .select('id,content')
      .in('id', ideaIds)
      .returns<{ id: string; content: string | null }[]>();
    if (ideaRows) {
      const textById = new Map(ideaRows.map((r) => [r.id, r.content ?? '']));
      for (const piece of pieces) {
        if (piece.refTable === 'ideas') piece.text = textById.get(piece.id) ?? piece.title;
      }
    }
  }

  return pieces;
}
