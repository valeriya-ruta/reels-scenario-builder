import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { Project, Scene, Transition } from '@/lib/domain';
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

  // Fetch project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (projectError || !project) {
    redirect('/projects');
  }

  // Fetch scenes ordered by order_index
  const { data: scenes, error: scenesError } = await supabase
    .from('scenes')
    .select('*')
    .eq('project_id', id)
    .order('order_index', { ascending: true });

  if (scenesError) {
    console.error('Error fetching scenes:', scenesError);
  }

  // Fetch transitions
  const { data: transitions, error: transitionsError } = await supabase
    .from('transitions')
    .select('*')
    .eq('project_id', id);

  if (transitionsError) {
    console.error('Error fetching transitions:', transitionsError);
  }

  return (
    <ProjectBuilder
      project={project as Project}
      initialScenes={(scenes as Scene[]) || []}
      initialTransitions={(transitions as Transition[]) || []}
    />
  );
}
