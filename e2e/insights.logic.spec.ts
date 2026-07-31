import { test, expect } from '@playwright/test';
import {
  buildProducerInsights,
  weekStartOf,
  weekOverWeekLabel,
  INSIGHT_WEEKS,
} from '@/lib/insights/producerInsights';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * §7 insights. These numbers sit on the home screen, which is the one place a
 * number has to be trustworthy — so they are all OUTPUT (what got published,
 * how steadily), never invented reach.
 */

// 2026-07-31 is a Friday; its week starts Monday 2026-07-27.
const TODAY = '2026-07-31';

function piece(over: Partial<ContentPiece> = {}): ContentPiece {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'u1',
    type: 'reel',
    status: 'script',
    title: 'Тест',
    refTable: 'projects',
    scheduledDate: null,
    createdAt: `${TODAY}T10:00:00.000Z`,
    updatedAt: `${TODAY}T10:00:00.000Z`,
    ...over,
  };
}

test.describe('week bucketing', () => {
  test('weeks start on Monday', () => {
    expect(weekStartOf('2026-07-31')).toBe('2026-07-27'); // Fri → Mon
    expect(weekStartOf('2026-07-27')).toBe('2026-07-27'); // Mon → itself
    expect(weekStartOf('2026-08-02')).toBe('2026-07-27'); // Sun → same week
    expect(weekStartOf('2026-08-03')).toBe('2026-08-03'); // next Mon
  });
});

test.describe('producer insights', () => {
  test('ideas are excluded — a dump is not output', () => {
    const out = buildProducerInsights(
      [piece({ refTable: 'ideas', type: 'idea', status: 'published' })],
      TODAY,
    );
    expect(out.total).toBe(0);
    expect(out.publishedThisWeek).toBe(0);
  });

  test('counts this week vs last week', () => {
    const out = buildProducerInsights(
      [
        piece({ status: 'published', updatedAt: '2026-07-29T10:00:00.000Z' }), // this week
        piece({ status: 'published', updatedAt: '2026-07-30T10:00:00.000Z' }), // this week
        piece({ status: 'published', updatedAt: '2026-07-22T10:00:00.000Z' }), // last week
      ],
      TODAY,
    );
    expect(out.publishedThisWeek).toBe(2);
    expect(out.publishedLastWeek).toBe(1);
    expect(weekOverWeekLabel(out)).toBe('+1 до минулого тижня');
  });

  test('week-over-week is null when flat, rather than "+0"', () => {
    const out = buildProducerInsights([], TODAY);
    expect(weekOverWeekLabel(out)).toBeNull();
  });

  test('an empty current week does not break the streak — it is still in progress', () => {
    // Published the two prior weeks, nothing yet this week. Punishing someone on
    // a Monday for not having posted yet is the opposite of a nudge.
    const out = buildProducerInsights(
      [
        piece({ status: 'published', updatedAt: '2026-07-22T10:00:00.000Z' }),
        piece({ status: 'published', updatedAt: '2026-07-15T10:00:00.000Z' }),
      ],
      TODAY,
    );
    expect(out.streakWeeks).toBe(2);
  });

  test('a real gap ends the streak', () => {
    const out = buildProducerInsights(
      [
        piece({ status: 'published', updatedAt: '2026-07-29T10:00:00.000Z' }), // this week
        // 2026-07-20 week skipped entirely
        piece({ status: 'published', updatedAt: '2026-07-13T10:00:00.000Z' }),
      ],
      TODAY,
    );
    expect(out.streakWeeks).toBe(1);
  });

  test('always returns exactly INSIGHT_WEEKS buckets, oldest first', () => {
    const out = buildProducerInsights([], TODAY);
    expect(out.weeks).toHaveLength(INSIGHT_WEEKS);
    expect(out.weeks[out.weeks.length - 1].weekStart).toBe('2026-07-27');
    const sorted = [...out.weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    expect(out.weeks.map((w) => w.weekStart)).toEqual(sorted.map((w) => w.weekStart));
  });

  test('planned counts today and later; waiting counts undated unpublished', () => {
    const out = buildProducerInsights(
      [
        piece({ scheduledDate: TODAY }),
        piece({ scheduledDate: '2026-08-05' }),
        piece({ scheduledDate: '2026-07-01' }), // past — not "ahead"
        piece({ scheduledDate: null, status: 'script' }),
        piece({ scheduledDate: null, status: 'published' }), // done, not waiting
      ],
      TODAY,
    );
    expect(out.plannedAhead).toBe(2);
    expect(out.waiting).toBe(1);
  });

  test('published share is a fraction, and zero content is 0 rather than NaN', () => {
    expect(buildProducerInsights([], TODAY).publishedShare).toBe(0);
    const out = buildProducerInsights(
      [piece({ status: 'published' }), piece({ status: 'script' })],
      TODAY,
    );
    expect(out.publishedShare).toBe(0.5);
  });
});
