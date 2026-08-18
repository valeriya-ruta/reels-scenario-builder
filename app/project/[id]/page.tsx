import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { Location, Project, Scene } from '@/lib/domain';
import ProjectBuilder from '@/components/ProjectBuilder';
import ReelTextScreen from '@/components/reels/ReelTextScreen';
import { REEL_BLOCK_COLUMNS, toReelBlock } from '@/lib/reels/blocks';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * A reel opens as its TEXT.
 *
 * Reels read `reel_blocks` — the table the operator edition already uses, so
 * both editions derive the same lists from the same rows. `scenes` is still
 * read for storytellings, and still mirrored INTO blocks by migration 036's
 * trigger, so the AI paths that write scenes keep working.
 *
 * The column list comes from `REEL_BLOCK_COLUMNS`. Typed out by hand it drifted
 * in three readers in a single day and silently emptied a reel on screen.
 */
export default async function ProjectPage({ params }: PageProps) {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (projectError || !project) redirect('/projects');

  if ((project as Project).project_type === 'reels') {
    const { data: rows, error } = await supabase
      .from('reel_blocks')
      .select(REEL_BLOCK_COLUMNS)
      .eq('project_id', id)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) console.error('Error fetching reel blocks:', error);

    return (
      <ReelTextScreen
        project={project as Project}
        initialBlocks={(rows ?? []).map((row) => toReelBlock(row as Record<string, unknown>))}
      />
    );
  }

  const [scenesRes, locationsRes] = await Promise.all([
    supabase.from('scenes').select('*').eq('project_id', id).order('order_index', { ascending: true }),
    supabase.from('locations').select('*').eq('user_id', user.id).order('name', { ascending: true }),
  ]);

  const { data: scenes, error: scenesError } = scenesRes;
  if (scenesError) console.error('Error fetching scenes:', scenesError);

  const { data: locations, error: locationsError } = locationsRes;
  if (locationsError) console.error('Error fetching locations:', locationsError);

  return (
    <ProjectBuilder
      project={project as Project}
      initialScenes={(scenes as Scene[]) || []}
      initialLocations={(locations as Location[]) || []}
    />
  );
}
