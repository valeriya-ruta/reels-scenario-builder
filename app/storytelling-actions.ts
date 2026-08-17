'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type {
  StorytellingColumn,
  StorytellingProject,
  StorytellingStory,
  VisualType,
  EngagementType,
} from '@/lib/domain';
import { ENGAGEMENT_OPTIONS, VISUAL_OPTIONS } from '@/lib/domain';
import { generateStoriesFromRant } from '@/lib/ai/rantToStories';
import { aiLimit } from '@/lib/ratelimit';
import { proposeSpread, isConsecutive } from '@/lib/content/proposeSpread';
import {
  boardTitle,
  nextSetIndex,
  proposeNextDayDate,
  resequenceSet,
  sortDays,
} from '@/lib/storytelling/board';
import { isPlaceholderTitle, NEW_LABELS } from '@/lib/content/displayTitle';
import { deriveStorytellingName, isUnnamedStorytelling } from '@/lib/storytelling/autoName';
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

/**
 * Rename the BOARD (the set), not its days.
 *
 * The board has no row of its own, so its title is denormalized onto every row
 * of the set (`set_name`, migration 028) — the same shape `set_size` already
 * uses. Nothing writes a day's `name` here: that is the whole point. A board
 * rename used to rewrite the days that shared the old stem, so naming the saga
 * silently renamed column 1.
 *
 * `{ ok: false, reason: 'no_column' }` means migration 028 has not been applied
 * yet; the caller falls back to the old stem rename so renaming keeps working
 * (with the old two-way behaviour) until it lands.
 */
export async function updateStorytellingSetName(
  setId: string,
  name: string,
): Promise<{ ok: true } | { ok: false; reason: 'no_column' | 'failed' }> {
  const user = await requireAuth();
  if (!user) return { ok: false, reason: 'failed' };
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return { ok: false, reason: 'failed' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('storytelling_projects')
    .update({ set_name: trimmed, updated_at: new Date().toISOString() })
    .eq('set_id', setId)
    .eq('user_id', user.id);

  if (error) {
    // PostgREST reports an unknown column as PGRST204 / 42703 depending on path.
    const missingColumn =
      error.code === 'PGRST204' || error.code === '42703' || /set_name/i.test(error.message ?? '');
    if (missingColumn) return { ok: false, reason: 'no_column' };
    console.error('updateStorytellingSetName', error);
    return { ok: false, reason: 'failed' };
  }
  return { ok: true };
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

// ── Day actions (the board's columns) ──

/**
 * A column of the storytelling board IS a storytelling — its own row, its own
 * date, its own status — tagged into a set with its neighbours. These actions
 * keep that tag honest: indexes stay 1..N, `set_size` stays the same number on
 * every row, and a set that shrinks to one day drops the tag entirely.
 */

/** Set tag as it now stands for one day, so the client can update in place. */
export type SetTag = {
  id: string;
  set_id: string | null;
  set_index: number | null;
  set_size: number | null;
};

export type AddedStorytellingDay = {
  project: StorytellingProject;
  columnId: string;
  storyId: string;
};

export type AddStorytellingDayResult =
  | { ok: true; day: AddedStorytellingDay; tags: SetTag[] }
  | { ok: false; error: string };

/** Local day key (YYYY-MM-DD) — the calendar is day-grained, no time. */
function todayDayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

/** Days already holding content, so a proposal never lands on top of one. */
async function occupiedDates(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  fromKey: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('content_pieces')
    .select('scheduled_date')
    .eq('user_id', userId)
    .not('scheduled_date', 'is', null)
    .gte('scheduled_date', fromKey);
  return ((data ?? []) as { scheduled_date: string }[]).map((r) => r.scheduled_date);
}

async function writeSetTags(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  tags: ReadonlyArray<SetTag>,
): Promise<void> {
  await Promise.all(
    tags.map((tag) =>
      supabase
        .from('storytelling_projects')
        .update({ set_id: tag.set_id, set_index: tag.set_index, set_size: tag.set_size })
        .eq('id', tag.id)
        .eq('user_id', userId),
    ),
  );
}

/**
 * Write the board's title onto every row of the set (`set_name`, migration 028).
 * Returns false when the column is not there yet, so callers can carry on
 * without it rather than failing the whole action.
 *
 * A placeholder («Новий сторітел») is NOT stored: pinning it would freeze the
 * board's title at the stand-in name forever, when what should happen is that
 * the board keeps deriving its title until a day names itself or the user names
 * the board on purpose.
 */
async function writeSetName(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  setId: string,
  name: string,
): Promise<boolean> {
  const trimmed = (name ?? '').trim().slice(0, 120);
  if (!trimmed || isPlaceholderTitle(trimmed)) return false;
  const { error } = await supabase
    .from('storytelling_projects')
    .update({ set_name: trimmed })
    .eq('set_id', setId)
    .eq('user_id', userId);
  return !error;
}

/**
 * Add a day to the board: a NEW storytelling next to the anchor, in the same
 * set, scheduled on the next open day and starting at Ідея with one empty card.
 *
 * Client-provided ids are honoured (optimistic UI): the column renders before
 * the insert resolves, and the card autosaves to a row that really exists.
 */
export async function addStorytellingDay(
  anchorProjectId: string,
  ids?: { projectId?: string; columnId?: string; storyId?: string },
): Promise<AddStorytellingDayResult> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  const supabase = await createServerSupabaseClient();
  // `*` rather than a column list: `set_name` (migration 028) is read here, and
  // naming it explicitly would make adding a day fail outright on a database
  // where the migration has not been applied yet.
  const { data: anchor } = await supabase
    .from('storytelling_projects')
    .select('*')
    .eq('id', anchorProjectId)
    .eq('user_id', user.id)
    .single();

  if (!anchor) return { ok: false, error: 'NOT_FOUND' };

  type Sibling = {
    id: string;
    name: string;
    set_id: string | null;
    set_index: number | null;
    set_name?: string | null;
    created_at: string;
    scheduled_date: string | null;
    project_id?: string | null;
  };

  const anchorRow = anchor as Sibling;
  let siblings: Sibling[] = [anchorRow];
  if (anchorRow.set_id) {
    const { data } = await supabase
      .from('storytelling_projects')
      .select('*')
      .eq('set_id', anchorRow.set_id)
      .eq('user_id', user.id);
    if (data && data.length > 0) siblings = data as Sibling[];
  }

  // A standalone becomes a set of two the moment a second day is added.
  const setId = anchorRow.set_id ?? globalThis.crypto.randomUUID();
  const index = nextSetIndex(siblings);
  // A new column arrives UNNAMED. It used to be minted as «<board> — день N»,
  // which is why an empty column showed up already wearing the board's title —
  // and why it could never name itself from what was written in it
  // (`isUnnamedStorytelling` only fills a placeholder). The board's own title
  // lives in `set_name`, so nothing is lost by leaving the day nameless.
  const name = NEW_LABELS.story;
  // The board keeps its title when a standalone becomes a set: whatever the
  // board was called (stored name, or the stem derived from the days) is written
  // as the set's own name, so it stops depending on any one day's `name`.
  const boardName = boardTitle(siblings.map((s) => ({ name: s.name ?? '', set_name: s.set_name })));
  const today = todayDayKey();
  const scheduledDate = proposeNextDayDate(
    siblings.map((s) => s.scheduled_date),
    today,
    await occupiedDates(supabase, user.id, today),
  );

  const projectInsert: Record<string, unknown> = {
    name,
    user_id: user.id,
    scheduled_date: scheduledDate,
    set_id: setId,
    set_index: index,
    set_size: siblings.length + 1,
    // Inherit the blogger the anchor belongs to (Pro scoping), not the ambient one.
    project_id: anchorRow.project_id ?? null,
  };
  if (ids?.projectId) projectInsert.id = ids.projectId;

  const { data: project, error: projectError } = await supabase
    .from('storytelling_projects')
    .insert(projectInsert)
    .select()
    .single();

  if (projectError || !project) {
    console.error('addStorytellingDay project', projectError);
    return { ok: false, error: 'INSERT_FAILED' };
  }

  const columnInsert: Record<string, unknown> = {
    project_id: project.id,
    name,
    order_index: 0,
  };
  if (ids?.columnId) columnInsert.id = ids.columnId;

  const { data: column, error: columnError } = await supabase
    .from('storytelling_columns')
    .insert(columnInsert)
    .select()
    .single();

  if (columnError || !column) {
    // A day with nowhere to write cards is worse than no day at all.
    await supabase.from('storytelling_projects').delete().eq('id', project.id).eq('user_id', user.id);
    console.error('addStorytellingDay column', columnError);
    return { ok: false, error: 'INSERT_FAILED' };
  }

  const storyInsert: Record<string, unknown> = { column_id: column.id, order_index: 0, text: '' };
  if (ids?.storyId) storyInsert.id = ids.storyId;
  const { data: story } = await supabase
    .from('storytelling_stories')
    .insert(storyInsert)
    .select()
    .single();

  // Re-tag the whole set: the anchor may have just acquired a set_id, and every
  // row carries the size. The new day goes LAST — the existing days are sorted
  // among themselves, so an untagged standalone stays day 1 rather than being
  // pushed behind the day just added to it.
  const ordered = [
    ...sortDays(
      siblings.map((s) => ({ id: s.id, set_index: s.set_index, created_at: s.created_at })),
    ).map((s) => s.id),
    project.id as string,
  ];
  const tags = resequenceSet(ordered, setId);
  await writeSetTags(supabase, user.id, tags);
  // …and the board's own title, on every row of the set including the new one.
  const namedSet = await writeSetName(supabase, user.id, setId, boardName);

  const tag = tags.find((t) => t.id === project.id);
  revalidatePath('/', 'layout');

  return {
    ok: true,
    day: {
      project: {
        ...(project as StorytellingProject),
        ...(tag ?? {}),
        ...(namedSet ? { set_name: boardName } : {}),
      },
      columnId: column.id as string,
      storyId: (story?.id as string) ?? (ids?.storyId ?? ''),
    },
    tags,
  };
}

/**
 * Remove one day from the board — the storytelling itself, with its cards.
 * The remaining days are re-numbered; a lone survivor stops being a set.
 */
export async function removeStorytellingDay(
  projectId: string,
): Promise<{ ok: true; tags: SetTag[] } | { ok: false; error: string }> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };

  const supabase = await createServerSupabaseClient();
  const { data: day } = await supabase
    .from('storytelling_projects')
    .select('id, set_id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (!day) return { ok: false, error: 'NOT_FOUND' };

  // The day's columns and cards go with it: both FKs are ON DELETE CASCADE, so
  // this is one atomic delete rather than three round trips that could half-fail.
  const { error } = await supabase
    .from('storytelling_projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', user.id);

  if (error) {
    console.error('removeStorytellingDay', error);
    return { ok: false, error: 'DELETE_FAILED' };
  }

  const setId = (day as { set_id: string | null }).set_id;
  let tags: SetTag[] = [];
  if (setId) {
    const { data: rest } = await supabase
      .from('storytelling_projects')
      .select('id, set_index, created_at')
      .eq('set_id', setId)
      .eq('user_id', user.id);
    tags = resequenceSet(
      sortDays((rest ?? []) as { id: string; set_index: number | null; created_at: string }[]).map(
        (d) => d.id,
      ),
      setId,
    );
    await writeSetTags(supabase, user.id, tags);
  }

  revalidatePath('/', 'layout');
  return { ok: true, tags };
}

/** Persist a new left-to-right order for the board. */
export async function reorderStorytellingDays(
  orderedIds: string[],
): Promise<{ ok: true; tags: SetTag[] } | { ok: false; error: string }> {
  const user = await requireAuth();
  if (!user) return { ok: false, error: 'UNAUTHORIZED' };
  if (orderedIds.length < 2) return { ok: false, error: 'NOT_A_SET' };

  const supabase = await createServerSupabaseClient();
  const { data: rows } = await supabase
    .from('storytelling_projects')
    .select('id, set_id')
    .in('id', orderedIds)
    .eq('user_id', user.id);

  const owned = (rows ?? []) as { id: string; set_id: string | null }[];
  if (owned.length !== orderedIds.length) return { ok: false, error: 'NOT_FOUND' };

  const setId = owned.find((r) => r.set_id)?.set_id;
  if (!setId) return { ok: false, error: 'NOT_A_SET' };

  const tags = resequenceSet(orderedIds, setId);
  await writeSetTags(supabase, user.id, tags);
  revalidatePath('/', 'layout');
  return { ok: true, tags };
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

/**
 * Give an unnamed storytelling a name taken from what has been written in it.
 *
 * A manually created story is stored as «Нова історія», so a week of them reads
 * as four identical rows in Сьогодні and План — you cannot tell which is which
 * without opening each one. Once a card holds a real sentence, that sentence
 * becomes the name.
 *
 * Only ever fills a PLACEHOLDER: a name the user typed (or one an earlier
 * auto-name already set) is never overwritten. The text comes from the client
 * because it is the freshest copy — the card's own autosave may still be in
 * flight — and it is the same user's writing either way; ownership is enforced
 * on the row that actually gets renamed.
 */
export async function autoNameStorytellingFromStory(
  storyId: string,
  text: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; reason: string }> {
  const user = await requireAuth();
  if (!user) return { ok: false, reason: 'UNAUTHORIZED' };

  const name = deriveStorytellingName(text);
  if (!name) return { ok: false, reason: 'TOO_THIN' };

  const supabase = await createServerSupabaseClient();

  const { data: story } = await supabase
    .from('storytelling_stories')
    .select('id, column_id')
    .eq('id', storyId)
    .single();
  if (!story) return { ok: false, reason: 'NOT_FOUND' };

  const { data: column } = await supabase
    .from('storytelling_columns')
    .select('id, project_id')
    .eq('id', (story as { column_id: string }).column_id)
    .single();
  if (!column) return { ok: false, reason: 'NOT_FOUND' };

  const { data: project } = await supabase
    .from('storytelling_projects')
    .select('id, name')
    .eq('id', (column as { project_id: string }).project_id)
    .eq('user_id', user.id)
    .single();
  if (!project) return { ok: false, reason: 'NOT_FOUND' };

  const current = (project as { id: string; name: string | null }).name;
  if (!isUnnamedStorytelling(current)) return { ok: false, reason: 'ALREADY_NAMED' };

  const { error } = await supabase
    .from('storytelling_projects')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', project.id)
    .eq('user_id', user.id);

  if (error) {
    console.error('autoNameStorytellingFromStory', error);
    return { ok: false, reason: 'UPDATE_FAILED' };
  }

  // Сьогодні, План and Контент all read the name from the same view.
  revalidatePath('/', 'layout');
  return { ok: true, id: project.id as string, name };
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

  // The generated saga is a BOARD, so it gets a board name of its own — not one
  // borrowed from whichever day happens to sit first (migration 028).
  if (setId) await writeSetName(supabase, user.id, setId, baseName);

  // The braindump reviews these as a fan-out; nothing is created silently.
  return {
    ok: true,
    projectId: created[0].id,
    days: created,
    reason: output.reason,
    consecutive: isConsecutive(created.map((c) => c.scheduledDate)),
  };
}
