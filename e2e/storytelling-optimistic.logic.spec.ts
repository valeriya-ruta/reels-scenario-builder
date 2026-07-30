import { test, expect } from '@playwright/test';
import {
  genClientId,
  nextOrderIndex,
  makeOptimisticColumn,
  makeOptimisticStory,
} from '../lib/storytelling/optimistic';

/**
 * Core-logic spec for optimistic create (task 86d3fcnny).
 *
 * The perceived-lag fix renders new columns/stories from local state before the
 * insert resolves, using client-generated ids and a max(order_index)+1 rule.
 * The full click→instant-render→reload-persists flow is covered by the guarded
 * browser harness (storytelling-optimistic.spec.ts); this pins the deterministic
 * ordering + builder contract so it can regress-test with zero config.
 */

test.describe('storytelling optimistic helpers', () => {
  test('nextOrderIndex is max(order_index)+1, not array length (survives gaps)', () => {
    expect(nextOrderIndex([])).toBe(0);
    expect(nextOrderIndex([{ order_index: 0 }, { order_index: 1 }])).toBe(2);
    // After deletes/reorders the array is shorter than the max index — length
    // would collide with an existing row; max+1 must win.
    expect(nextOrderIndex([{ order_index: 0 }, { order_index: 5 }])).toBe(6);
    expect(nextOrderIndex([{ order_index: 3 }])).toBe(4);
  });

  test('makeOptimisticStory renders an empty card under the given real id', () => {
    const story = makeOptimisticStory('col-1', 2, 'story-abc', '2026-07-30T00:00:00.000Z');
    expect(story).toMatchObject({
      id: 'story-abc',
      column_id: 'col-1',
      order_index: 2,
      text: '',
      visual: null,
      engagement: null,
    });
  });

  test('makeOptimisticColumn carries project + order', () => {
    const col = makeOptimisticColumn('proj-1', 'Storytelling 3', 4, 'col-xyz', '2026-07-30T00:00:00.000Z');
    expect(col).toMatchObject({ id: 'col-xyz', project_id: 'proj-1', name: 'Storytelling 3', order_index: 4 });
  });

  test('genClientId returns distinct non-empty ids', () => {
    const a = genClientId();
    const b = genClientId();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
});
