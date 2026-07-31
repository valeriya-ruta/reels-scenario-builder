import { test, expect } from '@playwright/test';
import { reelHasWriting, structureAction } from '@/lib/content/reelStructure';

/**
 * Structure re-selection must never STACK (§4, task 86d3wadne).
 *
 * The old handler appended at `scenes.length`, so picking a structure twice
 * produced one reel containing both scenarios. The rule now: replace silently
 * when there is nothing to lose, ask when there is, append never.
 */

const scene = (lines: string | null) => ({ lines });

test.describe('does the reel contain writing?', () => {
  test('empty, whitespace-only and null scenes are not writing', () => {
    expect(reelHasWriting([])).toBe(false);
    expect(reelHasWriting([scene(''), scene(null), scene('   \n  ')])).toBe(false);
  });

  test('one written scene among empties counts', () => {
    expect(reelHasWriting([scene(''), scene('Ти не втрачаєш клієнтів через ціну.'), scene(null)])).toBe(
      true,
    );
  });
});

test.describe('what re-selecting a structure does', () => {
  test('an untouched reel is replaced silently — there is nothing to lose', () => {
    expect(structureAction([])).toBe('replace-silently');
    // A template drops in NAMED but empty scenes. Those must not count as
    // writing, or picking a structure twice in a row would prompt about work
    // the user never did.
    expect(structureAction([scene(''), scene(''), scene('')])).toBe('replace-silently');
  });

  test('a written reel asks before touching anything', () => {
    expect(structureAction([scene('Хук про тишу між листами')])).toBe('ask');
  });

  test('there is no third outcome — appending is not reachable', () => {
    const outcomes = new Set([
      structureAction([]),
      structureAction([scene('')]),
      structureAction([scene('текст')]),
    ]);
    expect([...outcomes].sort()).toEqual(['ask', 'replace-silently']);
  });
});
