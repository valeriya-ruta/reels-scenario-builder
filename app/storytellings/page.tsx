import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import NewReelSubmitButton from '@/components/NewReelSubmitButton';
import ContentRowsSection from '@/components/content/ContentRowsSection';
import type { ContentPiece } from '@/lib/content/contentPiece';
import type { ContentStatus } from '@/lib/content/statusSystem';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  user_id: string;
  name: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default async function StorytellingsPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const supabase = await createServerSupabaseClient();
  const { data: projects, error } = await supabase
    .from('storytelling_projects')
    .select('id, user_id, name, status, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) console.error('Error fetching storytelling projects:', error);

  const now = new Date().toISOString();
  const pieces: ContentPiece[] = ((projects as Row[] | null) ?? []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    type: 'story',
    status: (p.status ?? 'idea') as ContentStatus,
    title: p.name?.trim() || 'Без назви',
    refTable: 'storytelling_projects',
    createdAt: p.created_at ?? now,
    updatedAt: p.updated_at ?? now,
  }));

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-zinc-900">Мої сторітелінги</h1>
          <CreateButton />
        </div>
        <ContentRowsSection
          pieces={pieces}
          emptyText="Тут поки що нічого немає. Створи перший сторітелінг."
        />
      </div>
    </div>
  );
}

function CreateButton() {
  return (
    <form action={createProject}>
      <NewReelSubmitButton idleLabel="Новий сторітелінг" pendingLabel="Створюю сторітелінг..." />
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
    .insert({ name: 'Без назви', user_id: user.id })
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
