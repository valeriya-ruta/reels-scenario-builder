import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { Project } from '@/lib/domain';
import ProjectsList from '@/components/ProjectsList';
import NewReelSubmitButton from '@/components/NewReelSubmitButton';

export default async function ProjectsPage() {
  const user = await requireAuth();
  
  if (!user) {
    redirect('/');
  }

  const supabase = await createServerSupabaseClient();
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .eq('project_type', 'reels')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching projects:', error);
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-zinc-900">Мої проєкти</h1>
          <CreateProjectButton />
        </div>
        <ProjectsList projects={(projects as Project[]) || []} />
      </div>
    </div>
  );
}

function CreateProjectButton() {
  return (
    <form action={createProject}>
      <NewReelSubmitButton
        idleLabel="Новий сценарій"
        pendingLabel="Створюю сценарій..."
      />
    </form>
  );
}

async function createProject() {
  'use server';
  
  const user = await requireAuth();
  if (!user) {
    return;
  }

  const supabase = await createServerSupabaseClient();
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name: 'Без назви',
      crew_mode: 'with_crew',
      user_id: user.id,
      project_type: 'reels',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating project:', error);
    return;
  }

  if (project) {
    const { redirect: redirectFn } = await import('next/navigation');
    redirectFn(`/project/${project.id}`);
  }
}
