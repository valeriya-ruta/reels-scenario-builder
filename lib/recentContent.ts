import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { ContentType } from '@/lib/contentTypes';

/**
 * A single recent content item for the Home "Твій контент" list. Mixes reels,
 * carousels and stories together, sorted most-recent-first by last update.
 */
export interface RecentContentItem {
  id: string;
  type: ContentType;
  title: string;
  updatedAt: string | null;
}

const DEFAULT_TITLE = 'Без назви';

interface Row {
  id: string;
  name: string | null;
  updated_at: string | null;
}

/**
 * Fetches the user's most recently updated content across all three types and
 * returns a merged, most-recent-first list (capped at `limit`). Failures on any
 * single source are logged and treated as empty so the Home page still renders.
 */
export async function getRecentContent(
  userId: string,
  limit = 5
): Promise<RecentContentItem[]> {
  const supabase = await createServerSupabaseClient();

  const [reels, carousels, stories] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, updated_at')
      .eq('user_id', userId)
      .eq('project_type', 'reels')
      .order('updated_at', { ascending: false })
      .limit(limit),
    supabase
      .from('carousel_projects')
      .select('id, name, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit),
    supabase
      .from('storytelling_projects')
      .select('id, name, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit),
  ]);

  if (reels.error) console.error('getRecentContent reels:', reels.error.message);
  if (carousels.error) console.error('getRecentContent carousels:', carousels.error.message);
  if (stories.error) console.error('getRecentContent stories:', stories.error.message);

  const map = (rows: Row[] | null, type: ContentType): RecentContentItem[] =>
    (rows ?? []).map((r) => ({
      id: r.id,
      type,
      title: r.name?.trim() || DEFAULT_TITLE,
      updatedAt: r.updated_at,
    }));

  const merged = [
    ...map(reels.data as Row[] | null, 'reels'),
    ...map(carousels.data as Row[] | null, 'carousel'),
    ...map(stories.data as Row[] | null, 'stories'),
  ];

  merged.sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });

  return merged.slice(0, limit);
}
