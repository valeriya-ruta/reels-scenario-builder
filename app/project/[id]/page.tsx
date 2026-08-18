import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { Project } from '@/lib/domain';
import { REEL_BLOCK_COLUMNS, toReelBlock } from '@/lib/reels/blocks';
import { getOwnerProgress, getReelShareLink } from '@/lib/reels/share';
import ReelBuilder from '@/components/reels/ReelBuilder';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * A reel, as blocks (migration 033).
 *
 * The old builder loaded `scenes` + `locations` and rendered a fixed row of
 * camera dropdowns per beat. That shape could only describe one person talking
 * to a camera; `reel_blocks` replaced it. Existing reels were copied across by
 * the migration, so a reel written before today opens with its text intact.
 */
export default async function ProjectPage({ params }: PageProps) {
  const user = await requireAuth();
  if (!user) redirect('/');

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const [projectRes, blocksRes, shareLink, ownerProgress] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase
      .from('reel_blocks')
      .select(REEL_BLOCK_COLUMNS)
      .eq('project_id', id)
      .order('order_index', { ascending: true }),
    getReelShareLink(id),
    getOwnerProgress(id),
  ]);

  const { data: project, error: projectError } = projectRes;
  if (projectError || !project) redirect('/projects');

  if (blocksRes.error) console.error('[reel] blocks read failed:', blocksRes.error.message);
  const blocks = (blocksRes.data ?? []).map((r) => toReelBlock(r as Record<string, unknown>));

  return (
    <ReelBuilder
      project={project as Project}
      initialBlocks={blocks}
      shareToken={shareLink?.token ?? null}
      ownerProgress={ownerProgress}
    />
  );
}
