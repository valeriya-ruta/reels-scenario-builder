import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { deleteProject } from '@/app/actions';
import SwipeableContentList from '@/components/content/SwipeableContentList';
import type { ContentPiece } from '@/lib/content/contentPiece';
import type { ContentStatus } from '@/lib/content/statusSystem';
import { attachPreviews } from '@/lib/content/contentPreview';
import { NEW_LABELS, displayTitle } from '@/lib/content/displayTitle';
import { getProScope, applyScope, insertProjectId } from '@/lib/pro/scope';

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
  const scope = await getProScope();
  const { data: projects, error } = await applyScope(
    supabase
      .from('projects')
      .select('id, user_id, name, status, scheduled_date, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('project_type', 'reels'),
    scope,
  ).order('updated_at', { ascending: false });

  if (error) console.error('Error fetching projects:', error);

  const now = new Date().toISOString();
  const rows: ContentPiece[] = ((projects as Row[] | null) ?? []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    type: 'reel',
    status: (p.status ?? 'idea') as ContentStatus,
    title: displayTitle(p.name, 'reel'),
    refTable: 'projects',
    scheduledDate: p.scheduled_date ?? null,
    createdAt: p.created_at ?? now,
    updatedAt: p.updated_at ?? now,
  }));

  // Cards preview the real designed output (cover slide / hook / opening
  // line) — the list row alone can't carry it.
  const pieces = await attachPreviews(rows);

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
  const scope = await getProScope();
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name: NEW_LABELS.reel,
      crew_mode: 'with_crew',
      user_id: user.id,
      project_type: 'reels',
      project_id: insertProjectId(scope),
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
