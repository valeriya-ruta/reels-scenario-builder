import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { deleteProject } from '@/app/actions';
import SwipeableContentList from '@/components/content/SwipeableContentList';
import type { ContentPiece } from '@/lib/content/contentPiece';
import type { ContentStatus } from '@/lib/content/statusSystem';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  user_id: string;
  name: string | null;
  status: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default async function ProjectsPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const supabase = await createServerSupabaseClient();
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, user_id, name, status, scheduled_date, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('project_type', 'reels')
    .order('updated_at', { ascending: false });

  if (error) console.error('Error fetching projects:', error);

  const now = new Date().toISOString();
  const pieces: ContentPiece[] = ((projects as Row[] | null) ?? []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    type: 'reel',
    status: (p.status ?? 'idea') as ContentStatus,
    title: p.name?.trim() || 'Без назви',
    refTable: 'projects',
    scheduledDate: p.scheduled_date ?? null,
    createdAt: p.created_at ?? now,
    updatedAt: p.updated_at ?? now,
  }));

  return (
    <div className="app-canvas">
      <div className="app-page">
        <SwipeableContentList
          pieces={pieces}
          heading="Рілси"
          iconKey="reel"
          accent="#7A3CE0"
          accentTint="#f1ecfd"
          onCreate={createReelProject}
          onDelete={deleteProject}
          emptyText="Рілсів ще немає — ось із чого я б зняла перший"
        />
      </div>
    </div>
  );
}

async function createReelProject() {
  'use server';
  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();
  const { data: project, error } = await supabase
    .from('projects')
    .insert({ name: 'Без назви', crew_mode: 'with_crew', user_id: user.id, project_type: 'reels' })
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
