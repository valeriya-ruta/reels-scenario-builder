import { test, expect } from '@playwright/test';
import { flattenStories, primaryColumnId } from '@/lib/storytelling/single';
import { fallbackProposals, normalizeTitle } from '@/lib/propose/fallback';
import { dropSeen, buildUserContent } from '@/lib/propose/proposeAngles';
import type { Proposal } from '@/lib/propose/types';

/**
 * §3 de-projectify: one storytelling is one story. The columns table survives
 * for legacy rows, so the read path must FLATTEN rather than show column one and
 * quietly drop the rest — hiding a legacy column looks exactly like data loss.
 */

const col = (id: string, order_index: number) => ({ id, order_index });
const story = (id: string, column_id: string, order_index: number) => ({
  id,
  column_id,
  order_index,
});

test.describe('one storytelling = one story', () => {
  test('new cards append to the first column by order, not by array position', () => {
    expect(primaryColumnId([col('b', 2), col('a', 0), col('c', 1)])).toBe('a');
  });

  test('a project with no columns yields null rather than a bogus id', () => {
    expect(primaryColumnId([])).toBeNull();
  });

  test('legacy multi-column rows flatten into one run, in column then story order', () => {
    const flat = flattenStories(
      [col('c1', 0), col('c2', 1)],
      [
        story('s3', 'c2', 0),
        story('s1', 'c1', 0),
        story('s4', 'c2', 1),
        story('s2', 'c1', 1),
      ],
    );
    expect(flat.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  test('an orphaned story is appended, never dropped', () => {
    // Its column is gone, but the row is still the user's writing.
    const flat = flattenStories([col('c1', 0)], [story('orphan', 'gone', 0), story('s1', 'c1', 0)]);
    expect(flat.map((s) => s.id)).toEqual(['s1', 'orphan']);
    expect(flat).toHaveLength(2);
  });

  test('flattening does not mutate the input array', () => {
    const input = [story('s2', 'c1', 1), story('s1', 'c1', 0)];
    flattenStories([col('c1', 0)], input);
    expect(input.map((s) => s.id)).toEqual(['s2', 's1']);
  });
});

/** §2: «Ще раз» must return genuinely new angles. */
test.describe('regenerate returns fresh proposals', () => {
  const p = (title: string): Proposal => ({
    id: title,
    title,
    rationale: 'бо',
    seed: 's',
    suggestedType: null,
    source: 'cold-start',
  });

  test('drops anything already shown', () => {
    const out = dropSeen([p('Кут А'), p('Кут Б')], ['Кут А']);
    expect(out.map((x) => x.title)).toEqual(['Кут Б']);
  });

  test('matches case- and whitespace-insensitively, so a reword is still a repeat', () => {
    expect(dropSeen([p('  КУТ   А ')], ['кут а'])).toEqual([]);
    expect(normalizeTitle('  Дві   Строки ')).toBe('дві строки');
  });

  test('an empty exclusion list passes everything through', () => {
    expect(dropSeen([p('Кут А')], [])).toHaveLength(1);
  });

  test('the fallback rotates rather than re-serving the same cold-start cards', () => {
    const first = fallbackProposals([]);
    const second = fallbackProposals([], 3, first.map((x) => x.title));
    // With three cold-start angles and three excluded, it has to repeat — but it
    // must still return a full deck rather than an empty one.
    expect(second).toHaveLength(3);

    const partial = fallbackProposals([], 2, [first[0].title]);
    expect(partial.some((x) => normalizeTitle(x.title) === normalizeTitle(first[0].title))).toBe(
      false,
    );
  });

  test('the prompt tells the model what it already showed', () => {
    const withExclusions = buildUserContent([], ['Кут А']);
    expect(withExclusions).toContain('Кут А');
    expect(withExclusions).toContain('вже бачила');
    // …and stays clean when there is nothing to avoid.
    expect(buildUserContent([])).not.toContain('вже бачила');
  });
});
