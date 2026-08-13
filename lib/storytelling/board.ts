/**
 * The storytelling BOARD — several storytellings side by side, each on its own
 * day (pure helpers).
 *
 * ── Why the columns are separate projects ─────────────────────────────────
 * The board used to be N `storytelling_columns` nested inside ONE project. That
 * broke dating outright: the project carried a single `scheduled_date`, so three
 * columns meant three days of posting sharing one date, and a column had no
 * status of its own at all.
 *
 * So a column here is a whole storytelling — its own row in
 * `storytelling_projects`, with its own name, its own `scheduled_date` and its
 * own `status`. Days that belong together are tagged with a shared `set_id`
 * (migration 025), which is what this board reads. That also means a column's
 * date and status are the SAME fields План, Контент and Інсайти already read —
 * a date set on the board shows up on the calendar with no extra plumbing.
 *
 * `storytelling_columns` survives as the container a day's cards hang off (no
 * migration); legacy rows spread across several of them are flattened per day by
 * `single.ts`.
 *
 * Import-free of React/DOM so every rule here is unit-testable.
 */

import type { StorytellingColumn, StorytellingProject, StorytellingStory } from '@/lib/domain';
import { flattenStories, primaryColumnId } from '@/lib/storytelling/single';
import { addDays, proposeSpread } from '@/lib/content/proposeSpread';

/** One column of the board: a storytelling, its date, its status, its cards. */
export type BoardDay = {
  project: StorytellingProject;
  /** Where new cards are written — the day's first column, or null if it has none. */
  columnId: string | null;
  stories: StorytellingStory[];
};

type DayLike = { id: string; set_index?: number | null; created_at?: string };

/**
 * Board order: by `set_index`, then by age. A day with no index (a standalone
 * that was never part of a set) sorts last rather than jumping to the front.
 */
export function sortDays<T extends DayLike>(days: ReadonlyArray<T>): T[] {
  return [...days].sort((a, b) => {
    const ia = a.set_index ?? Number.MAX_SAFE_INTEGER;
    const ib = b.set_index ?? Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    const ca = a.created_at ?? '';
    const cb = b.created_at ?? '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

/** Group the flat rows of a whole set into board columns. */
export function buildBoardDays(
  projects: ReadonlyArray<StorytellingProject>,
  columns: ReadonlyArray<StorytellingColumn>,
  stories: ReadonlyArray<StorytellingStory>,
): BoardDay[] {
  const columnsByProject = new Map<string, StorytellingColumn[]>();
  for (const column of columns) {
    const arr = columnsByProject.get(column.project_id) ?? [];
    arr.push(column);
    columnsByProject.set(column.project_id, arr);
  }

  return sortDays(projects).map((project) => {
    const dayColumns = columnsByProject.get(project.id) ?? [];
    const ids = new Set(dayColumns.map((c) => c.id));
    const dayStories = stories.filter((s) => ids.has(s.column_id));
    return {
      project,
      columnId: primaryColumnId(dayColumns),
      // A day can still own several legacy columns; they read as one run.
      stories: flattenStories(dayColumns, dayStories),
    };
  });
}

/** The index a freshly added day takes (1-based, never colliding with an existing one). */
export function nextSetIndex(days: ReadonlyArray<DayLike>): number {
  const highest = days.reduce((max, d) => Math.max(max, d.set_index ?? 0), 0);
  return Math.max(highest, days.length) + 1;
}

/**
 * Re-number a set after a day is removed or moved. `set_size` is denormalised on
 * every row, so all of them are rewritten together — a set that says "2 з 3"
 * after a delete is worse than no counter at all.
 *
 * A set of one is NOT a set: the last day drops its tag and goes back to being a
 * standalone storytelling.
 */
export function resequenceSet(
  orderedIds: ReadonlyArray<string>,
  setId: string,
): Array<{ id: string; set_id: string | null; set_index: number | null; set_size: number | null }> {
  if (orderedIds.length <= 1) {
    return orderedIds.map((id) => ({ id, set_id: null, set_index: null, set_size: null }));
  }
  return orderedIds.map((id, i) => ({
    id,
    set_id: setId,
    set_index: i + 1,
    set_size: orderedIds.length,
  }));
}

/** Trailing "— день 2" / "· день 2" / "- день 2", however it was written. */
const DAY_SUFFIX = /\s*[—–\-·|:]?\s*день\s*\d+\s*$/i;

export function stripDaySuffix(name: string): string {
  return name.replace(DAY_SUFFIX, '').trim();
}

/** Name for a newly added day: the saga's name plus which day it is. */
export function dayName(base: string, index: number): string {
  const stem = stripDaySuffix(base) || 'Історія';
  return `${stem} — день ${index}`.slice(0, 120);
}

/**
 * What the whole board is called.
 *
 * There is no parent row to hold a saga title (that parent is exactly what broke
 * dating), so it is derived: the days' shared stem when they have one, the first
 * day's name when they don't. Nothing is written back — deriving it means a
 * renamed day can never leave the board titled after something that no longer
 * exists.
 */
export function setTitle(names: ReadonlyArray<string>): string {
  const bases = names.map(stripDaySuffix).filter((n) => n.length > 0);
  if (bases.length === 0) return '';
  if (bases.every((b) => b === bases[0])) return bases[0];
  const shared = commonWordPrefix(bases);
  return shared.length >= 3 ? shared : bases[0];
}

/** Longest prefix shared by all names, cut back to a whole word. */
function commonWordPrefix(names: ReadonlyArray<string>): string {
  let prefix = names[0];
  for (const name of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) return '';
  }
  // Never end mid-word ("Як я поч" is not a title): a prefix that already stops
  // at a space or a separator is kept whole, anything else is cut back to the
  // last space.
  const SEPARATORS = /[\s—–\-·|:,.;!?]/;
  const whole = SEPARATORS.test(prefix.slice(-1))
    ? prefix
    : prefix.slice(0, prefix.lastIndexOf(' ') + 1);
  return whole.replace(/[\s—–\-·|:,.;!?]+$/, '').trim();
}

/**
 * The day a newly added column should land on: the next OPEN day after the set's
 * last dated day (or after today, when the set carries no dates yet).
 *
 * Same rule the braindump fan-out uses — a new day proposed on top of an already
 * booked one isn't a plan, it's a pile-up. Nothing is locked: the user moves it
 * from the column's own date chip.
 */
export function proposeNextDayDate(
  existingDates: ReadonlyArray<string | null | undefined>,
  todayKey: string,
  occupied: ReadonlyArray<string> = [],
): string {
  const dated = existingDates
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .map((d) => d.slice(0, 10))
    .sort();
  const last = dated[dated.length - 1];
  // Never propose a day in the past, even when the set itself is behind.
  const start = last && addDays(last, 1) > todayKey ? addDays(last, 1) : todayKey;
  return proposeSpread(start, 1, [...occupied, ...dated])[0];
}

/** Slavic plural pick (1 / 2–4 / 5+), so counters never read "3 історія". */
export function pluralUa(n: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** The line under the title: «3 історії · 12 сторіс». */
export function boardSummary(dayCount: number, storyCount: number): string {
  const days = `${dayCount} ${pluralUa(dayCount, 'історія', 'історії', 'історій')}`;
  return `${days} · ${storyCount} сторіс`;
}

export function totalStories(days: ReadonlyArray<{ stories: ReadonlyArray<unknown> }>): number {
  return days.reduce((sum, d) => sum + d.stories.length, 0);
}
