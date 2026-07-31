'use server';

import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { StorytellingColumn, StorytellingStory, VisualType, EngagementType } from '@/lib/domain';
import { ENGAGEMENT_OPTIONS, VISUAL_OPTIONS } from '@/lib/domain';
import { generateStoriesFromRant } from '@/lib/ai/rantToStories';
import { aiLimit } from '@/lib/ratelimit';
import { proposeSpread, isConsecutive } from '@/lib/content/proposeSpread';
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
  ids?: { columnId?: string; storyId?: string },
): Promise<{ column: StorytellingColumn; story: StorytellingStory } | null> {
  const user = await requireAuth();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();

  // Client-provided ids (optimistic UI): the client already rendered the column
  // + first story under these ids, so persist them as-is rather than minting new
  // ones — keeps StoryCard autosave targeting a real row with no reconcile race.
  const columnInsert: Record<string, unknown> = { project_id: projectId, name, order_index: orderIndex };
  if (ids?.columnId) columnInsert.id = ids.columnId;

  const { data: column, error } = await supabase
    .from('storytelling_columns')
    .insert(columnInsert)
    .select()
    .single();

  if (error || !column) return null;

  const storyInsert: Record<string, unknown> = { column_id: column.id, order_index: 0, text: '' };
  if (ids?.storyId) storyInsert.id = ids.storyId;

  const { data: story, error: storyErr } = await supabase
    .from('storytelling_stories')
    .insert(storyInsert)
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
  id?: string,
): Promise<StorytellingStory | null> {
  const user = await requireAuth();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();

  const storyInsert: Record<string, unknown> = { column_id: columnId, order_index: orderIndex, text: '' };
  if (id) storyInsert.id = id;

  const { data, error } = await supabase
    .from('storytelling_stories')
    .insert(storyInsert)
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
  const lines = [slide.screen_text.trim()];
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

/** One generated storytelling day, for the braindump's fan-out review. */
export type CreatedStorytellingDay = {
  id: string;
  name: string;
  scheduledDate: string;
  storyCount: number;
  /** The day's opening line — what the story actually sounds like. */
  opening: string;
  /** Which прогрів barrier this day carries (saga only). */
  goal?: string | null;
};

export type CreateStorytellingFromRantResult =
  | {
      ok: true;
      projectId: string;
      days: CreatedStorytellingDay[];
      /** The engine's first-person one-liner: why single vs saga, why this shape. */
      reason: string;
      /** True when the proposed dates are simply consecutive from today. */
      consecutive: boolean;
    }
  | { ok: false; error: string };

/**
 * Генерує сторітелінг(и) з ренту. Одна історія → один сторітел; сага → кілька
 * окремих сторітелів, по одному на день, заплановані на послідовні дні.
 */
export async function createStorytellingProjectFromRant(
  rant: string,
  name = '',
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
    output = await generateStoriesFromRant(trimmed, name);
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'Не вдалося згенерувати сценарій. Спробуй ще раз.';
    return { ok: false, error: message };
  }

  const supabase = await createServerSupabaseClient();
  const baseName = (name.trim() || output.template_name.trim() || 'Сторітел').slice(0, 120);

  // A storytelling is ONE day's set of stories: its own project, with its own
  // date and status. So a saga is NOT one project holding N day-columns (a single
  // date can't stand for several days of posting) — it's N storytellings, dated
  // on consecutive days starting today. Each still keeps one internal column,
  // which is just the container its story cards live in.
  const days =
    output.days.length > 0 ? output.days : [{ day_number: 1, title: baseName, slides: output.slides }];

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;

  // Propose dates on the next OPEN days rather than blindly consecutive ones: a
  // saga that lands on top of three already-booked days isn't a plan, it's a
  // pile-up. The user confirms or moves them in the fan-out review.
  const { data: booked } = await supabase
    .from('content_pieces')
    .select('scheduled_date')
    .eq('user_id', user.id)
    .not('scheduled_date', 'is', null)
    .gte('scheduled_date', todayKey);
  const occupied = ((booked ?? []) as { scheduled_date: string }[]).map((r) => r.scheduled_date);
  const proposedDates = proposeSpread(todayKey, days.length, occupied);

  const created: CreatedStorytellingDay[] = [];
  // Sibling tag for a multi-day generation: no parent object (that would break
  // dating) — just a shared id so the UI can render 1/3, 2/3, 3/3 anywhere.
  const setId = days.length > 1 ? globalThis.crypto.randomUUID() : null;

  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const dayName = (
      days.length > 1 ? day.title?.trim() || `${baseName} — день ${d + 1}` : baseName
    ).slice(0, 120);
    const scheduledDate = proposedDates[d];

    const { data: project, error: projectError } = await supabase
      .from('storytelling_projects')
      .insert({
        name: dayName,
        user_id: user.id,
        scheduled_date: scheduledDate,
        ...(setId ? { set_id: setId, set_index: d + 1, set_size: days.length } : {}),
      })
      .select()
      .single();

    if (projectError || !project) {
      console.error('createStorytellingProjectFromRant project', projectError);
      if (created.length === 0) {
        return { ok: false, error: 'Не вдалося створити сторітел.' };
      }
      break; // keep the days that already saved
    }

    const { data: column, error: columnError } = await supabase
      .from('storytelling_columns')
      .insert({ project_id: project.id, name: dayName, order_index: 0 })
      .select()
      .single();

    if (columnError || !column) {
      await supabase.from('storytelling_projects').delete().eq('id', project.id);
      console.error('createStorytellingProjectFromRant column', columnError);
      continue;
    }

    const rows = day.slides.map((slide, index) => ({
      column_id: column.id,
      order_index: index,
      text: formatSlideTextForStorytelling(slide),
      visual: mapSlideVisualToDb(slide.visual),
      engagement: mapSlideInteractiveToDb(slide.interactive),
    }));

    if (rows.length > 0) {
      const { error: storiesError } = await supabase.from('storytelling_stories').insert(rows);
      if (storiesError) {
        console.error('createStorytellingProjectFromRant stories', storiesError);
      }
    }

    created.push({
      id: project.id as string,
      name: dayName,
      scheduledDate,
      storyCount: rows.length,
      // The first slide's on-screen text IS the story's opening line — the card
      // shows what the story actually sounds like, not a database row.
      opening: day.slides[0]?.screen_text?.trim() ?? '',
      goal: day.goal ?? null,
    });
  }

  if (created.length === 0) {
    return { ok: false, error: 'Не вдалося зберегти сторіс. Спробуй ще раз.' };
  }

  // The braindump reviews these as a fan-out; nothing is created silently.
  return {
    ok: true,
    projectId: created[0].id,
    days: created,
    reason: output.reason,
    consecutive: isConsecutive(created.map((c) => c.scheduledDate)),
  };
}
