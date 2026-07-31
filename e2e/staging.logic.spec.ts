import { test, expect } from '@playwright/test';
import {
  isStaged,
  stagedPieces,
  stagedAgeDays,
  staleness,
  stagingPressure,
  sortByPressure,
  countNeedingDecision,
  stagingSummary,
  wouldFloodStaging,
  STALE_AFTER_DAYS,
  NUDGE_AFTER_DAYS,
  MAX_BATCH_INTO_STAGING,
} from '@/lib/content/staging';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Staging is a place designed to be EMPTIED. These pin the rules that keep it
 * from becoming a graveyard: only the undecided are in it, aging is always
 * visible (there is no neutral "stored" state), and the pile is worked
 * oldest-first.
 */

const NOW = '2026-07-31T12:00:00.000Z';

function piece(over: Partial<ContentPiece> = {}): ContentPiece {
  return {
    id: 'p1',
    userId: 'u1',
    type: 'reel',
    status: 'script',
    title: 'Тест',
    refTable: 'projects',
    scheduledDate: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

test.describe('what counts as staged', () => {
  test('kept but undated and unpublished', () => {
    expect(isStaged(piece())).toBe(true);
  });

  test('a dated piece is committed, not staged', () => {
    expect(isStaged(piece({ scheduledDate: '2026-08-02' }))).toBe(false);
  });

  test('a published piece is done, not staged', () => {
    expect(isStaged(piece({ status: 'published' }))).toBe(false);
  });

  test('a braindump is a source, not a piece awaiting a decision', () => {
    expect(isStaged(piece({ refTable: 'ideas', type: 'idea' }))).toBe(false);
  });

  test('stagedPieces filters a mixed list', () => {
    const list = [
      piece({ id: 'a' }),
      piece({ id: 'b', scheduledDate: '2026-08-01' }),
      piece({ id: 'c', refTable: 'ideas', type: 'idea' }),
      piece({ id: 'd', status: 'published' }),
    ];
    expect(stagedPieces(list).map((p) => p.id)).toEqual(['a']);
  });
});

test.describe('aging pressure', () => {
  test('age is whole days and never negative', () => {
    expect(stagedAgeDays(piece({ updatedAt: '2026-07-25T12:00:00.000Z' }), NOW)).toBe(6);
    expect(stagedAgeDays(piece({ updatedAt: '2026-08-05T12:00:00.000Z' }), NOW)).toBe(0);
  });

  test('staleness escalates at the two thresholds', () => {
    expect(staleness(0)).toBe('fresh');
    expect(staleness(STALE_AFTER_DAYS - 1)).toBe('fresh');
    expect(staleness(STALE_AFTER_DAYS)).toBe('aging');
    expect(staleness(NUDGE_AFTER_DAYS)).toBe('stale');
  });

  test('there is no neutral "stored" wording — even a fresh item is awaiting', () => {
    expect(stagingPressure(0)).toBe('Чекає на дату');
    expect(stagingPressure(2)).toContain('без дати');
    expect(stagingPressure(NUDGE_AFTER_DAYS)).toContain('відпускаємо');
  });

  test('the pile is worked oldest-first', () => {
    const sorted = sortByPressure([
      piece({ id: 'new', updatedAt: '2026-07-30T12:00:00.000Z' }),
      piece({ id: 'old', updatedAt: '2026-07-01T12:00:00.000Z' }),
      piece({ id: 'mid', updatedAt: '2026-07-20T12:00:00.000Z' }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['old', 'mid', 'new']);
  });

  test('sortByPressure does not mutate its input', () => {
    const input = [
      piece({ id: 'new', updatedAt: '2026-07-30T12:00:00.000Z' }),
      piece({ id: 'old', updatedAt: '2026-07-01T12:00:00.000Z' }),
    ];
    sortByPressure(input);
    expect(input.map((p) => p.id)).toEqual(['new', 'old']);
  });

  test('counts only items past the nudge threshold', () => {
    const list = [
      piece({ id: 'a', updatedAt: '2026-07-01T12:00:00.000Z' }), // 30d
      piece({ id: 'b', updatedAt: '2026-07-29T12:00:00.000Z' }), // 2d
    ];
    expect(countNeedingDecision(list, NOW)).toBe(1);
  });
});

test.describe('summary + flood guard', () => {
  test('summary uses correct Ukrainian plurals', () => {
    expect(stagingSummary(0)).toBe('Нічого не зависло');
    expect(stagingSummary(1)).toBe('1 річ чекає на рішення');
    expect(stagingSummary(3)).toBe('3 речі чекають на рішення');
    expect(stagingSummary(7)).toBe('7 речей чекають на рішення');
    expect(stagingSummary(12)).toBe('12 речей чекають на рішення');
  });

  test('a batch above the cap would flood staging', () => {
    expect(wouldFloodStaging(MAX_BATCH_INTO_STAGING)).toBe(false);
    expect(wouldFloodStaging(MAX_BATCH_INTO_STAGING + 1)).toBe(true);
    expect(wouldFloodStaging(0)).toBe(false);
  });
});
