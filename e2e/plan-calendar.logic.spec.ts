import { test, expect } from '@playwright/test';
import {
  monthGrid,
  groupByScheduledDate,
  shiftMonth,
  dateKey,
  dayHeaderLabel,
  WEEKDAY_LABELS,
} from '../lib/content/calendar';
import type { ContentPiece } from '../lib/content/contentPiece';

/**
 * Core-logic spec for the План content calendar (task 86d3d23nj): the Mon-first
 * month grid, month navigation, and grouping content by scheduled_date (which
 * drives the per-day count badge).
 */

function piece(id: string, scheduledDate: string | null): ContentPiece {
  return {
    id,
    userId: 'u',
    type: 'reel',
    status: 'idea',
    title: id,
    refTable: 'projects',
    scheduledDate,
    createdAt: '',
    updatedAt: '',
  };
}

test.describe('план calendar — grid + grouping', () => {
  test('weekday headers are Monday-first', () => {
    expect(WEEKDAY_LABELS[0]).toBe('Пн');
    expect(WEEKDAY_LABELS[5]).toBe('Сб');
    expect(WEEKDAY_LABELS[6]).toBe('Нд');
  });

  test('month grid is a rectangular 42-cell Mon-first grid', () => {
    // June 2026: 1 Jun 2026 is a Monday, so the grid starts exactly on the 1st.
    const cells = monthGrid(2026, 5); // month0=5 → June
    expect(cells).toHaveLength(42);
    expect(cells[0].key).toBe('2026-06-01');
    expect(cells[0].inMonth).toBe(true);
    // 30 days in June → last in-month cell is the 30th.
    const inMonth = cells.filter((c) => c.inMonth);
    expect(inMonth[0].day).toBe(1);
    expect(inMonth[inMonth.length - 1].day).toBe(30);
    expect(inMonth).toHaveLength(30);
  });

  test('leading spillover fills when the 1st is not a Monday', () => {
    // April 2026: 1 Apr 2026 is a Wednesday → 2 leading spillover days (Mon–Tue).
    const cells = monthGrid(2026, 3);
    expect(cells[0].inMonth).toBe(false);
    expect(cells[0].key).toBe('2026-03-30'); // the Monday of that week
    expect(cells[2].key).toBe('2026-04-01');
    expect(cells[2].inMonth).toBe(true);
  });

  test('a Sunday 1st gets a full leading week, never a Sunday-first row', () => {
    // 1 Mar 2026 is a Sunday → it sits in the LAST column, after 6 spillover days.
    const cells = monthGrid(2026, 2);
    expect(cells[0].key).toBe('2026-02-23');
    expect(cells[6].key).toBe('2026-03-01');
  });

  test('today flag only set for the matching key', () => {
    const cells = monthGrid(2026, 2, '2026-03-15');
    expect(cells.filter((c) => c.isToday)).toHaveLength(1);
    expect(cells.find((c) => c.isToday)?.key).toBe('2026-03-15');
  });

  test('shiftMonth wraps year boundaries', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month0: 11 });
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month0: 0 });
  });

  test('groupByScheduledDate buckets by day and skips unscheduled', () => {
    const map = groupByScheduledDate([
      piece('a', '2026-03-15'),
      piece('b', '2026-03-15'),
      piece('c', '2026-03-16'),
      piece('d', null),
    ]);
    expect(map.get('2026-03-15')).toHaveLength(2); // drives the "2" badge
    expect(map.get('2026-03-16')).toHaveLength(1);
    expect(map.has('unscheduled')).toBe(false);
    expect([...map.values()].flat()).toHaveLength(3);
  });

  test('dateKey pads and dayHeaderLabel carries the weekday', () => {
    expect(dateKey(2026, 2, 3)).toBe('2026-03-03');
    // 23 Mar 2026 is a Monday; a date without its weekday is half a date.
    expect(dayHeaderLabel('2026-03-23')).toBe('пн, 23 бер');
    expect(dayHeaderLabel('2026-08-18')).toBe('вт, 18 сер');
  });
});
