import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type {
  StorytellingProject,
  StorytellingColumn,
  StorytellingStory,
} from '@/lib/domain';
import StorytellingBuilder from '@/components/StorytellingBuilder';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StorytellingPage({ params }: PageProps) {
  const user = await requireAuth();
  if (!user) redirect('/');

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from('storytelling_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (projectError || !project) redirect('/storytellings');

  const { data: columns } = await supabase
    .from('storytelling_columns')
    .select('*')
    .eq('project_id', id)
    .order('order_index', { ascending: true });

  const columnIds = (columns || []).map((c: StorytellingColumn) => c.id);

  let stories: StorytellingStory[] = [];
  if (columnIds.length > 0) {
    const { data } = await supabase
      .from('storytelling_stories')
      .select('*')
      .in('column_id', columnIds)
      .order('order_index', { ascending: true });
    stories = (data as StorytellingStory[]) || [];
  }

  return (
    <StorytellingBuilder
      project={project as StorytellingProject}
      initialColumns={(columns as StorytellingColumn[]) || []}
      initialStories={stories}
    />
  );
}
