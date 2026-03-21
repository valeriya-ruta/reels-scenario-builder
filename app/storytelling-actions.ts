'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type {
  StorytellingProject,
  StorytellingColumn,
  StorytellingStory,
  VisualType,
  EngagementType,
} from '@/lib/domain';

// ── Project actions ──

export async function updateStorytellingProjectName(projectId: string, name: string) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await supabase
    .from('storytelling_projects')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', user.id);
}

export async function deleteStorytellingProject(projectId: string) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await supabase
    .from('storytelling_projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', user.id);
}

// ── Column actions ──

export async function createStorytellingColumn(
  projectId: string,
  name: string,
  orderIndex: number,
): Promise<{ column: StorytellingColumn; story: StorytellingStory } | null> {
  const user = await requireAuth();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();

  const { data: column, error } = await supabase
    .from('storytelling_columns')
    .insert({ project_id: projectId, name, order_index: orderIndex })
    .select()
    .single();

  if (error || !column) return null;

  const { data: story, error: storyErr } = await supabase
    .from('storytelling_stories')
    .insert({ column_id: column.id, order_index: 0, text: '' })
    .select()
    .single();

  if (storyErr || !story) return null;

  await supabase
    .from('storytelling_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);

  return {
    column: column as StorytellingColumn,
    story: story as StorytellingStory,
  };
}

export async function updateStorytellingColumnName(columnId: string, name: string) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('storytelling_columns').update({ name }).eq('id', columnId);
}

export async function deleteStorytellingColumn(columnId: string) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('storytelling_columns').delete().eq('id', columnId);
}

export async function reorderStorytellingColumns(projectId: string, columnIds: string[]) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await Promise.all(
    columnIds.map((id, index) =>
      supabase
        .from('storytelling_columns')
        .update({ order_index: index })
        .eq('id', id)
        .eq('project_id', projectId),
    ),
  );
}

// ── Story actions ──

export async function createStorytellingStory(
  columnId: string,
  orderIndex: number,
): Promise<StorytellingStory | null> {
  const user = await requireAuth();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('storytelling_stories')
    .insert({ column_id: columnId, order_index: orderIndex, text: '' })
    .select()
    .single();

  if (error || !data) return null;
  return data as StorytellingStory;
}

export async function updateStorytellingStory(
  storyId: string,
  updates: {
    text?: string;
    visual?: VisualType | null;
    engagement?: EngagementType | null;
  },
) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('storytelling_stories').update(updates).eq('id', storyId);
}

export async function deleteStorytellingStory(storyId: string) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from('storytelling_stories').delete().eq('id', storyId);
}

export async function reorderStorytellingStories(columnId: string, storyIds: string[]) {
  const user = await requireAuth();
  if (!user) return;
  const supabase = await createServerSupabaseClient();
  await Promise.all(
    storyIds.map((id, index) =>
      supabase
        .from('storytelling_stories')
        .update({ order_index: index })
        .eq('id', id)
        .eq('column_id', columnId),
    ),
  );
}
