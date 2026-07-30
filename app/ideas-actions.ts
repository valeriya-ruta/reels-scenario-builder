'use server';

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
 * what was already created from it. Upsert on (idea_id, content_type) so
 * re-linking the same type never creates a duplicate row. Best-effort: a link
 * failure must not break the (already successful) content creation.
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
  await supabase
    .from('idea_content_links')
    .upsert(
      { user_id: user.id, idea_id: ideaId, content_type: contentType, content_id: contentId },
      { onConflict: 'idea_id,content_type' },
    );
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
