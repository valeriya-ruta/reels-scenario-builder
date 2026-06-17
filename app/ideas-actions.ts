'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

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
