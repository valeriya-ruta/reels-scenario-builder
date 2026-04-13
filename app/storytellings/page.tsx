import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { StorytellingProject } from '@/lib/domain';
import StorytellingProjectsList from '@/components/StorytellingProjectsList';

export default async function StorytellingsPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const supabase = await createServerSupabaseClient();
  const { data: projects, error } = await supabase
    .from('storytelling_projects')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) console.error('Error fetching storytelling projects:', error);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-zinc-900">Мої сторітелінги</h1>
          <CreateButton />
        </div>
        <StorytellingProjectsList projects={(projects as StorytellingProject[]) || []} />
      </div>
    </div>
  );
}

function CreateButton() {
  return (
    <form action={createProject}>
      <button
        type="submit"
        className="btn-primary cursor-pointer rounded-xl bg-[color:var(--accent)] px-4 py-2 font-medium text-white transition-[background,transform] hover:brightness-110"
      >
        Новий сторітелінг
      </button>
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
