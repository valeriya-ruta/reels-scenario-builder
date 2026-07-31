import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import NewReelSubmitButton from '@/components/NewReelSubmitButton';
import ContentRowsSection from '@/components/content/ContentRowsSection';
import type { ContentPiece } from '@/lib/content/contentPiece';
import type { ContentStatus } from '@/lib/content/statusSystem';
import { attachPreviews } from '@/lib/content/contentPreview';
import { NEW_LABELS, displayTitle } from '@/lib/content/displayTitle';

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

export default async function StorytellingsPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const supabase = await createServerSupabaseClient();
  const { data: projects, error } = await supabase
    .from('storytelling_projects')
    .select('id, user_id, name, status, scheduled_date, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) console.error('Error fetching storytelling projects:', error);

  const now = new Date().toISOString();
  const rows: ContentPiece[] = ((projects as Row[] | null) ?? []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    type: 'story',
    status: (p.status ?? 'idea') as ContentStatus,
    title: displayTitle(p.name, 'story'),
    refTable: 'storytelling_projects',
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
        <div className="mb-4 flex items-center justify-between gap-3 px-0.5">
          <div className="min-w-0">
            <h1 className="app-title truncate">Сторітелінги</h1>
            <p className="app-subtitle">{pieces.length} матеріалів</p>
          </div>
          <CreateButton />
        </div>
        <ContentRowsSection
          pieces={pieces}
          emptyText="Сторіс ще немає — ось із чого я б почала розповідь"
        />
      </div>
    </div>
  );
}

function CreateButton() {
  return (
    <form action={createProject}>
      <NewReelSubmitButton idleLabel="Новий сторітелінг" pendingLabel="Створюю…" accent="#C08C28" />
    </form>
  );
}

async function createProject() {
  'use server';

  const user = await requireAuth();
  if (!user) return;

  const supabase = await createServerSupabaseClient();

  const { data: project, error } = await supabase
    .from('storytelling_projects')
    .insert({ name: NEW_LABELS.story, user_id: user.id })
    .select()
    .single();

  if (error || !project) {
    console.error('Error creating storytelling project:', error);
    return;
  }

  const { data: column } = await supabase
    .from('storytelling_columns')
    .insert({ project_id: project.id, name: 'Storytelling 1', order_index: 0 })
    .select()
    .single();

  if (column) {
    await supabase
      .from('storytelling_stories')
      .insert({ column_id: column.id, order_index: 0, text: '' });
  }

  const { redirect: redirectFn } = await import('next/navigation');
  redirectFn(`/storytelling/${project.id}`);
}
