import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type {
  StorytellingProject,
  StorytellingColumn,
  StorytellingStory,
} from '@/lib/domain';
import StorytellingBuilder from '@/components/StorytellingBuilder';
import { buildBoardDays } from '@/lib/storytelling/board';

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

  // The board shows the whole set: every day of the saga side by side, each with
  // its own date and status. A standalone storytelling is simply a set of one.
  let days: StorytellingProject[] = [project as StorytellingProject];
  const setId = (project as StorytellingProject).set_id;
  if (setId) {
    const { data: siblings } = await supabase
      .from('storytelling_projects')
      .select('*')
      .eq('set_id', setId)
      .eq('user_id', user.id);
    if (siblings && siblings.length > 0) days = siblings as StorytellingProject[];
  }

  const dayIds = days.map((d) => d.id);
  const { data: columns } = await supabase
    .from('storytelling_columns')
    .select('*')
    .in('project_id', dayIds)
    .order('order_index', { ascending: true });

  const columnIds = ((columns as StorytellingColumn[]) || []).map((c) => c.id);

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
      initialDays={buildBoardDays(days, (columns as StorytellingColumn[]) || [], stories)}
      currentId={id}
    />
  );
}
