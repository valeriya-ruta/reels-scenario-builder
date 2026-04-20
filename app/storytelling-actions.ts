'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { StorytellingColumn, StorytellingStory, VisualType, EngagementType } from '@/lib/domain';
import { ENGAGEMENT_OPTIONS, VISUAL_OPTIONS } from '@/lib/domain';
import { generateStoriesFromRant } from '@/lib/ai/rantToStories';
import { aiLimit } from '@/lib/ratelimit';
import type { Slide } from '@/lib/ai/rantToStories';

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

function formatSlideTextForStorytelling(slide: Slide): string {
  const lines = [slide.screen_text.trim(), '', `Озвучення: ${slide.voiceover.trim()}`];
  if (slide.notes?.trim()) {
    lines.push('', `Нотатка: ${slide.notes.trim()}`);
  }
  return lines.join('\n');
}

function mapSlideVisualToDb(visual: Slide['visual']): VisualType | null {
  if (visual === 'Говоряча голова') return 'Говоряща голова';
  if (VISUAL_OPTIONS.includes(visual as VisualType)) return visual as VisualType;
  return 'Говоряща голова';
}

function mapSlideInteractiveToDb(interactive: Slide['interactive']): EngagementType | null {
  if (interactive === null) return null;
  if (interactive === 'Заклик в директ') return 'Заклик в дірект';
  if (ENGAGEMENT_OPTIONS.includes(interactive as EngagementType)) return interactive as EngagementType;
  return null;
}

export type CreateStorytellingFromRantResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string };

/**
 * Генерує сценарій сторіс з ренту і зберігає його як новий проєкт сторітелу (колонка + картки).
 */
export async function createStorytellingProjectFromRant(
  rant: string,
): Promise<CreateStorytellingFromRantResult> {
  const user = await requireAuth();
  if (!user) {
    return { ok: false, error: 'Необхідно увійти в акаунт.' };
  }

  const trimmed = rant.trim();
  if (!trimmed) {
    return { ok: false, error: 'Введи рент перед генерацією.' };
  }

  const { success } = await aiLimit.limit(user.id);
  if (!success) {
    return { ok: false, error: 'Ліміт запитів вичерпано. Спробуй пізніше.' };
  }

  let output: Awaited<ReturnType<typeof generateStoriesFromRant>>;
  try {
    output = await generateStoriesFromRant(trimmed);
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'Не вдалося згенерувати сценарій. Спробуй ще раз.';
    return { ok: false, error: message };
  }

  const supabase = await createServerSupabaseClient();
  const projectName = output.template_name.trim() || 'Сторітел з ренту';

  const { data: project, error: projectError } = await supabase
    .from('storytelling_projects')
    .insert({ name: projectName, user_id: user.id })
    .select()
    .single();

  if (projectError || !project) {
    console.error('createStorytellingProjectFromRant project', projectError);
    return { ok: false, error: 'Не вдалося створити проєкт сторітелу.' };
  }

  const columnName = `Шаблон ${output.template_used} — ${output.template_name}`.slice(0, 120);

  const { data: column, error: columnError } = await supabase
    .from('storytelling_columns')
    .insert({ project_id: project.id, name: columnName, order_index: 0 })
    .select()
    .single();

  if (columnError || !column) {
    await supabase.from('storytelling_projects').delete().eq('id', project.id);
    console.error('createStorytellingProjectFromRant column', columnError);
    return { ok: false, error: 'Не вдалося створити колонку сторітелу.' };
  }

  const rows = output.slides.map((slide, index) => ({
    column_id: column.id,
    order_index: index,
    text: formatSlideTextForStorytelling(slide),
    visual: mapSlideVisualToDb(slide.visual),
    engagement: mapSlideInteractiveToDb(slide.interactive),
  }));

  const { error: storiesError } = await supabase.from('storytelling_stories').insert(rows);

  if (storiesError) {
    await supabase.from('storytelling_columns').delete().eq('id', column.id);
    await supabase.from('storytelling_projects').delete().eq('id', project.id);
    console.error('createStorytellingProjectFromRant stories', storiesError);
    return { ok: false, error: 'Не вдалося зберегти сторіс. Спробуй ще раз.' };
  }

  await supabase
    .from('storytelling_projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', project.id);

  return { ok: true, projectId: project.id as string };
}
