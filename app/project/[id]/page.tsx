import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { Location, Project, Scene } from '@/lib/domain';
import ProjectBuilder from '@/components/ProjectBuilder';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: PageProps) {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  // Fetch project, scenes, and user locations concurrently.
  const [projectRes, scenesRes, locationsRes] = await Promise.all([
    supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('scenes')
      .select('*')
      .eq('project_id', id)
      .order('order_index', { ascending: true }),
    supabase
      .from('locations')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true }),
  ]);

  const { data: project, error: projectError } = projectRes;
  if (projectError || !project) redirect('/projects');

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
