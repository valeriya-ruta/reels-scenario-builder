'use server';
import { displayTitle } from '@/lib/content/displayTitle';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { ContentType } from '@/lib/contentTypes';

const LINKABLE_TYPES: ContentType[] = ['reels', 'carousel', 'stories'];

/**
 * Full text of a braindump idea (RLS-scoped to the owner). Used when an idea-type
 * row is tapped, to reopen the braindump overlay pre-loaded with the idea's text
 * (task 86d3cpv9x) — the content_pieces view only carries a truncated title.
 */
export async function getIdeaText(id: string): Promise<string> {
  const user = await requireAuth();
  if (!user) return '';
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('ideas')
    .select('content')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<{ content: string }>();
  return data?.content ?? '';
}

/**
 * Persist the idea → content link (task 86d3czf1e) so reopening the idea shows
 * what was already created from it, and so any piece can name the dump it came
 * from. Upsert on the link's real identity — (idea, type, target) — so a dump
 * can own SEVERAL children of the same type (a saga is 3 stories from one dump)
 * while re-linking the same target stays idempotent.
 *
 * Best-effort by design: a link failure must never break the content creation
 * that already succeeded. (Migration 026, which widens the unique constraint to
 * allow the fan-out, is applied to prod as of 2026-07-31.)
 */
export async function linkIdeaToContent(
  ideaId: string,
  contentType: ContentType,
  contentId: string,
): Promise<void> {
  if (!ideaId || !contentId || !LINKABLE_TYPES.includes(contentType)) return;
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('idea_content_links')
    .upsert(
      { user_id: user.id, idea_id: ideaId, content_type: contentType, content_id: contentId },
      { onConflict: 'idea_id,content_type,content_id' },
    );
  if (error) {
    console.warn('[ideas] link failed (migration 026 applied?):', error.message);
  }
}

/** Link several created pieces to one dump — the fan-out case (saga → N days). */
export async function linkIdeaToMany(
  ideaId: string,
  contentType: ContentType,
  contentIds: string[],
): Promise<void> {
  for (const id of contentIds) {
    await linkIdeaToContent(ideaId, contentType, id);
  }
}

/** One piece a braindump produced, as shown in the dump's fan-out. */
export type IdeaChild = {
  contentType: ContentType;
  contentId: string;
  title: string;
  status: string;
  scheduledDate: string | null;
};

/**
 * Everything this braindump produced — the fan-out ("this dump → 3 stories,
 * 1 carousel"). A braindump is not consumed on generation: it stays a saved
 * object that OWNS its children, and this is the read that proves it.
 */
export async function getIdeaChildren(ideaId: string): Promise<IdeaChild[]> {
  if (!ideaId) return [];
  const user = await requireAuth();
  if (!user) return [];
  const supabase = await createServerSupabaseClient();

  const { data: links } = await supabase
    .from('idea_content_links')
    .select('content_type,content_id')
    .eq('idea_id', ideaId)
    .eq('user_id', user.id);

  const rows = ((links ?? []) as { content_type: string; content_id: string }[]).filter((r) =>
    LINKABLE_TYPES.includes(r.content_type as ContentType),
  );
  if (rows.length === 0) return [];

  // One read for every child regardless of type — the unified view already
  // spans all four tables.
  const { data: pieces } = await supabase
    .from('content_pieces')
    .select('id,title,status,scheduled_date')
    .eq('user_id', user.id)
    .in('id', rows.map((r) => r.content_id));

  const byId = new Map(
    ((pieces ?? []) as { id: string; title: string | null; status: string; scheduled_date: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  return rows
    .map((r) => {
      const piece = byId.get(r.content_id);
      if (!piece) return null; // child was deleted; the link is stale
      return {
        contentType: r.content_type as ContentType,
        contentId: r.content_id,
        title: displayTitle(piece.title, 'idea'),
        status: piece.status,
        scheduledDate: piece.scheduled_date,
      };
    })
    .filter((c): c is IdeaChild => c !== null);
}

/** The braindump a piece came from, for the trace-back chip. */
export type IdeaSource = { id: string; title: string; text: string; proven: boolean };

/**
 * Walk the link backwards: which dump produced this piece? `proven` is true when
 * ANY child of that dump reached Опубліковано — the "this worked, go deeper?"
 * signal (2.3), derived rather than stored so it can never go stale.
 */
export async function getIdeaForContent(contentId: string): Promise<IdeaSource | null> {
  if (!contentId) return null;
  const user = await requireAuth();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();

  const { data: link } = await supabase
    .from('idea_content_links')
    .select('idea_id')
    .eq('content_id', contentId)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle<{ idea_id: string }>();
  if (!link) return null;

  const [ideaRes, siblingsRes] = await Promise.all([
    supabase
      .from('ideas')
      .select('id,title,content')
      .eq('id', link.idea_id)
      .eq('user_id', user.id)
      .maybeSingle<{ id: string; title: string | null; content: string }>(),
    supabase.from('idea_content_links').select('content_id').eq('idea_id', link.idea_id).eq('user_id', user.id),
  ]);
  if (!ideaRes.data) return null;

  const siblingIds = ((siblingsRes.data ?? []) as { content_id: string }[]).map((r) => r.content_id);
  let proven = false;
  if (siblingIds.length > 0) {
    const { count } = await supabase
      .from('content_pieces')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'published')
      .in('id', siblingIds);
    proven = (count ?? 0) > 0;
  }

  const text = ideaRes.data.content ?? '';
  return {
    id: ideaRes.data.id,
    title: (ideaRes.data.title ?? '').trim() || text.slice(0, 60),
    text,
    proven,
  };
}

/** Which content types have already been created from this idea (RLS-scoped). */
export async function getIdeaContentLinks(ideaId: string): Promise<ContentType[]> {
  if (!ideaId) return [];
  const user = await requireAuth();
  if (!user) return [];
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('idea_content_links')
    .select('content_type')
    .eq('idea_id', ideaId)
    .eq('user_id', user.id);
  const rows = (data ?? []) as { content_type: string }[];
  return rows
    .map((r) => r.content_type)
    .filter((t): t is ContentType => LINKABLE_TYPES.includes(t as ContentType));
}
