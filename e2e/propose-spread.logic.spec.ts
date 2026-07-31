import { test, expect } from '@playwright/test';
import { proposeSpread, addDays, daysBetween, isConsecutive } from '@/lib/content/proposeSpread';

/**
 * The fan-out review promises "spread across the next OPEN days". A saga landing
 * on top of three already-booked days is a pile-up, not a plan — so these pin
 * the two things that must hold: proposed days are free, and the caller always
 * gets exactly as many dates as it has pieces.
 */

const TODAY = '2026-07-31';

test.describe('proposeSpread', () => {
  test('with an empty calendar, proposes consecutive days from today', () => {
    const dates = proposeSpread(TODAY, 3, []);
    expect(dates).toEqual(['2026-07-31', '2026-08-01', '2026-08-02']);
    expect(isConsecutive(dates)).toBe(true);
  });

  test('skips days that already hold something', () => {
    const dates = proposeSpread(TODAY, 3, ['2026-08-01', '2026-08-03']);
    expect(dates).toEqual(['2026-07-31', '2026-08-02', '2026-08-04']);
    expect(isConsecutive(dates)).toBe(false);
  });

  test('two proposals never collide with each other', () => {
    const dates = proposeSpread(TODAY, 5, []);
    expect(new Set(dates).size).toBe(5);
  });

  test('normalizes timestamp-shaped occupied values to day keys', () => {
    const dates = proposeSpread(TODAY, 1, ['2026-07-31T18:00:00.000Z']);
    expect(dates).toEqual(['2026-08-01']);
  });

  test('always returns `count` dates, even against a wall-to-wall calendar', () => {
    const booked: string[] = [];
    for (let i = 0; i < 90; i++) booked.push(addDays(TODAY, i));
    const dates = proposeSpread(TODAY, 3, booked);
    // Better a stacked day the user can move than a piece with no date at all.
    expect(dates).toHaveLength(3);
    expect(new Set(dates).size).toBe(3);
  });

  test('startOffset delays the first proposal', () => {
    expect(proposeSpread(TODAY, 2, [], 1)).toEqual(['2026-08-01', '2026-08-02']);
  });

  test('count of zero or less is empty, not a crash', () => {
    expect(proposeSpread(TODAY, 0, [])).toEqual([]);
    expect(proposeSpread(TODAY, -3, [])).toEqual([]);
  });
});

test.describe('date math', () => {
  test('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('daysBetween is signed and whole', () => {
    expect(daysBetween('2026-07-31', '2026-08-02')).toBe(2);
    expect(daysBetween('2026-08-02', '2026-07-31')).toBe(-2);
    expect(daysBetween('2026-07-31', '2026-07-31')).toBe(0);
  });

  test('isConsecutive is true for a single date and for an empty set', () => {
    expect(isConsecutive([])).toBe(true);
    expect(isConsecutive(['2026-07-31'])).toBe(true);
    expect(isConsecutive(['2026-07-31', '2026-08-02'])).toBe(false);
  });
});
