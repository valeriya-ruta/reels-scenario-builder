import { test, expect } from '@playwright/test';
import {
  boardSummary,
  buildBoardDays,
  dayName,
  nextSetIndex,
  pluralUa,
  proposeNextDayDate,
  renameSetStem,
  resequenceSet,
  setTitle,
  sortDays,
  stripDaySuffix,
  totalStories,
} from '@/lib/storytelling/board';
import type { StorytellingColumn, StorytellingProject, StorytellingStory } from '@/lib/domain';

/**
 * The storytelling board is back as SEVERAL storytellings side by side — but a
 * column is now a whole storytelling (its own row, its own date, its own
 * status), tagged into a set with its neighbours. These pin the rules that make
 * that safe: grouping, board order, set re-numbering, the derived saga title,
 * and the date proposed for a newly added day.
 */

const day = (
  id: string,
  over: Partial<StorytellingProject> = {},
): StorytellingProject => ({
  id,
  user_id: 'u1',
  name: id,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  set_id: 'set-1',
  set_index: null,
  set_size: null,
  scheduled_date: null,
  status: 'idea',
  ...over,
});

const column = (id: string, project_id: string, order_index = 0): StorytellingColumn => ({
  id,
  project_id,
  name: id,
  order_index,
  created_at: '2026-08-01T00:00:00.000Z',
});

const story = (id: string, column_id: string, order_index = 0): StorytellingStory => ({
  id,
  column_id,
  order_index,
  text: '',
  visual: null,
  engagement: null,
  created_at: '2026-08-01T00:00:00.000Z',
});

test.describe('board grouping', () => {
  test('each day keeps only its own cards, in its own order', () => {
    const days = buildBoardDays(
      [day('p1', { set_index: 1 }), day('p2', { set_index: 2 })],
      [column('c1', 'p1'), column('c2', 'p2')],
      [story('s2', 'c1', 1), story('s3', 'c2', 0), story('s1', 'c1', 0)],
    );

    expect(days.map((d) => d.project.id)).toEqual(['p1', 'p2']);
    expect(days[0].stories.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(days[1].stories.map((s) => s.id)).toEqual(['s3']);
  });

  test('a legacy day spread over several columns still reads as one run', () => {
    // §3 flattening survives inside a day: hiding a legacy column would look
    // exactly like data loss.
    const days = buildBoardDays(
      [day('p1', { set_index: 1 })],
      [column('c1', 'p1', 0), column('c2', 'p1', 1)],
      [story('s3', 'c2', 0), story('s1', 'c1', 0), story('s2', 'c1', 1)],
    );

    expect(days).toHaveLength(1);
    expect(days[0].stories.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    // New cards go to the first column by order, not by array position.
    expect(days[0].columnId).toBe('c1');
  });

  test('a day with no column yields a null write target rather than a bogus id', () => {
    const days = buildBoardDays([day('p1')], [], []);
    expect(days[0].columnId).toBeNull();
    expect(days[0].stories).toEqual([]);
  });

  test('totalStories counts the whole board', () => {
    const days = buildBoardDays(
      [day('p1', { set_index: 1 }), day('p2', { set_index: 2 })],
      [column('c1', 'p1'), column('c2', 'p2')],
      [story('s1', 'c1'), story('s2', 'c2'), story('s3', 'c2', 1)],
    );
    expect(totalStories(days)).toBe(3);
  });
});

test.describe('board order', () => {
  test('days sort by set_index, not by the order the rows came back', () => {
    const sorted = sortDays([
      day('c', { set_index: 3 }),
      day('a', { set_index: 1 }),
      day('b', { set_index: 2 }),
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  test('an untagged day sorts last instead of jumping to the front', () => {
    const sorted = sortDays([
      day('loose', { set_index: null }),
      day('first', { set_index: 1 }),
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['first', 'loose']);
  });

  test('same index falls back to age, so order is never random', () => {
    const sorted = sortDays([
      day('newer', { set_index: 1, created_at: '2026-08-02T00:00:00.000Z' }),
      day('older', { set_index: 1, created_at: '2026-08-01T00:00:00.000Z' }),
    ]);
    expect(sorted.map((d) => d.id)).toEqual(['older', 'newer']);
  });

  test('the next day takes an index that cannot collide with an existing one', () => {
    expect(nextSetIndex([])).toBe(1);
    expect(nextSetIndex([day('a', { set_index: 1 }), day('b', { set_index: 2 })])).toBe(3);
    // Gaps (a middle day was deleted before re-numbering) must not reuse an index.
    expect(nextSetIndex([day('a', { set_index: 1 }), day('b', { set_index: 5 })])).toBe(6);
    // Untagged days still count, so a standalone + new day becomes 1 and 2.
    expect(nextSetIndex([day('a', { set_index: null })])).toBe(2);
  });
});

test.describe('set re-numbering', () => {
  test('every row carries the same size and a 1..N index', () => {
    expect(resequenceSet(['a', 'b', 'c'], 'set-1')).toEqual([
      { id: 'a', set_id: 'set-1', set_index: 1, set_size: 3 },
      { id: 'b', set_id: 'set-1', set_index: 2, set_size: 3 },
      { id: 'c', set_id: 'set-1', set_index: 3, set_size: 3 },
    ]);
  });

  test('a set of one is not a set — the last survivor drops the tag', () => {
    // Otherwise a lone storytelling would keep rendering as «1 з 1».
    expect(resequenceSet(['a'], 'set-1')).toEqual([
      { id: 'a', set_id: null, set_index: null, set_size: null },
    ]);
    expect(resequenceSet([], 'set-1')).toEqual([]);
  });
});

test.describe('naming', () => {
  test('the day suffix is stripped however it was written', () => {
    expect(stripDaySuffix('Як я почала — день 2')).toBe('Як я почала');
    expect(stripDaySuffix('Як я почала · день 10')).toBe('Як я почала');
    expect(stripDaySuffix('Як я почала - День 3')).toBe('Як я почала');
    expect(stripDaySuffix('Як я почала')).toBe('Як я почала');
  });

  test('a new day is named after the saga, never stacking suffixes', () => {
    expect(dayName('Як я почала', 2)).toBe('Як я почала — день 2');
    expect(dayName('Як я почала — день 1', 2)).toBe('Як я почала — день 2');
    expect(dayName('   ', 2)).toBe('Історія — день 2');
  });

  test('the board title is the shared stem of its days', () => {
    expect(setTitle(['Як я почала — день 1', 'Як я почала — день 2'])).toBe('Як я почала');
  });

  test('differently named days fall back to a whole-word common stem', () => {
    expect(setTitle(['Злам року: початок', 'Злам року: рішення'])).toBe('Злам року');
  });

  test('days with nothing in common keep the first day\'s name, never a fragment', () => {
    expect(setTitle(['Початок', 'Провал'])).toBe('Початок');
    expect(setTitle([])).toBe('');
  });
});

test.describe('the date a new day lands on', () => {
  test('it follows the set\'s last dated day', () => {
    expect(proposeNextDayDate(['2026-08-13', '2026-08-14'], '2026-08-13')).toBe('2026-08-15');
  });

  test('it skips days that already hold content', () => {
    expect(
      proposeNextDayDate(['2026-08-13'], '2026-08-13', ['2026-08-14', '2026-08-15']),
    ).toBe('2026-08-16');
  });

  test('it never collides with a sibling, even an out-of-order one', () => {
    // The set's own days count as occupied too.
    expect(proposeNextDayDate(['2026-08-20', '2026-08-13'], '2026-08-13')).toBe('2026-08-21');
  });

  test('an undated set starts today', () => {
    expect(proposeNextDayDate([null, undefined], '2026-08-13')).toBe('2026-08-13');
  });

  test('a set stuck in the past proposes today, not another past day', () => {
    expect(proposeNextDayDate(['2026-07-01'], '2026-08-13')).toBe('2026-08-13');
  });
});

test.describe('the counter line', () => {
  test('Ukrainian plural never reads «3 історія»', () => {
    expect(pluralUa(1, 'історія', 'історії', 'історій')).toBe('історія');
    expect(pluralUa(3, 'історія', 'історії', 'історій')).toBe('історії');
    expect(pluralUa(5, 'історія', 'історії', 'історій')).toBe('історій');
    // The teens are the trap: 11–14 take the many form.
    expect(pluralUa(11, 'історія', 'історії', 'історій')).toBe('історій');
    expect(pluralUa(21, 'історія', 'історії', 'історій')).toBe('історія');
  });

  test('summary reads as a sentence', () => {
    expect(boardSummary(1, 4)).toBe('1 історія · 4 сторіс');
    expect(boardSummary(3, 12)).toBe('3 історії · 12 сторіс');
  });
});

test.describe('renaming the board', () => {
  const day = (id: string, name: string) => ({ id, name });

  test('the new stem replaces the old one on every day that carried it', () => {
    expect(
      renameSetStem(
        [day('a', 'Злам року'), day('b', 'Злам року — день 2'), day('c', 'Злам року — день 3')],
        'Злам року',
        'Новий сторітел',
      ),
    ).toEqual([
      { id: 'a', name: 'Новий сторітел' },
      { id: 'b', name: 'Новий сторітел — день 2' },
      { id: 'c', name: 'Новий сторітел — день 3' },
    ]);
  });

  test('a day renamed by hand keeps its name — a board rename never erases it', () => {
    const out = renameSetStem(
      [day('a', 'Злам року'), day('b', 'Як я звільнилась')],
      'Злам року',
      'Новий сторітел',
    );
    expect(out).toEqual([{ id: 'a', name: 'Новий сторітел' }]);
  });

  test('nothing is written when the name did not actually change', () => {
    expect(renameSetStem([day('a', 'Злам року')], 'Злам року', 'Злам року')).toEqual([]);
    expect(renameSetStem([day('a', 'Злам року')], 'Злам року', '   ')).toEqual([]);
    expect(renameSetStem([day('a', 'Злам року')], '', 'Нове')).toEqual([]);
  });
});
