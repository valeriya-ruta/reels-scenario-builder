import { test, expect } from '@playwright/test';
import { agendaHeading, sortedDayKeys } from '../lib/content/calendar';
import { trackFor } from '../lib/content/statusSystem';

/**
 * Core-logic spec for the Home agenda + the storytelling lifecycle.
 *
 * The app leads with "what am I posting today / next" (date-grouped agenda), and
 * a storytelling is now one day's stories with its own status track.
 */

test.describe('agenda grouping', () => {
  const today = '2026-07-30';

  test('today and tomorrow read as words, later days as date + weekday', () => {
    expect(agendaHeading('2026-07-30', today)).toContain('Сьогодні');
    expect(agendaHeading('2026-07-31', today)).toContain('Завтра');
    const later = agendaHeading('2026-08-02', today);
    expect(later).not.toContain('Сьогодні');
    expect(later).not.toContain('Завтра');
    expect(later).toContain('2 сер');
  });

  test('day keys are de-duplicated, sorted, and ignore unscheduled', () => {
    expect(sortedDayKeys(['2026-08-02', '2026-07-30', null, '2026-08-02', undefined])).toEqual([
      '2026-07-30',
      '2026-08-02',
    ]);
    expect(sortedDayKeys([])).toEqual([]);
  });
});

test.describe('storytelling lifecycle', () => {
  test('a storytelling runs Ідея → Скрипт → Готово → Опубліковано', () => {
    expect(trackFor('story')).toEqual(['idea', 'script', 'ready', 'published']);
  });
});
