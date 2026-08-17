/**
 * Pure month-grid + scheduling helpers for the План content calendar
 * (task 86d3d23nj). Import-free (types are erased) so the grid math + grouping
 * are unit-testable without a DOM. UTC-based date math avoids timezone
 * off-by-one when formatting day keys.
 */

import type { ContentPiece } from '@/lib/content/contentPiece';

export type CalendarCell = {
  /** 'YYYY-MM-DD' local day key. */
  key: string;
  /** Day of month (1–31). */
  day: number;
  /** Whether this cell belongs to the displayed month (vs. spillover). */
  inMonth: boolean;
  /** True for the real "today" (only when a todayKey is supplied). */
  isToday: boolean;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function dateKey(year: number, month0: number, day: number): string {
  return `${year}-${pad(month0 + 1)}-${pad(day)}`;
}

/**
 * Ukrainian weekday headers, MONDAY-first (Пн–Нд).
 *
 * The week here starts on Monday because that is the week the user actually
 * plans in — a content week runs Mon→Sun, and a Sunday-first grid put the
 * weekend on both ends of the row.
 */
export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

/** Short weekday names indexed by JS `getUTCDay()` (0=Sun…6=Sat). */
const WEEKDAY_SHORT_BY_DAY = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const MONTH_LABELS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

export function monthLabel(year: number, month0: number): string {
  return `${MONTH_LABELS[month0]} ${year}`;
}

const SHORT_MONTH_LABELS = [
  'СІЧ', 'ЛЮТ', 'БЕР', 'КВІ', 'ТРА', 'ЧЕР', 'ЛИП', 'СЕР', 'ВЕР', 'ЖОВ', 'ЛИС', 'ГРУ',
];

/**
 * A dated label for a 'YYYY-MM-DD' key, e.g. «вт, 18 сер».
 *
 * The weekday is part of the date, not decoration: «18 сер» tells you nothing
 * about whether that is a working day, and a plan is read in weekdays. Used by
 * every date chip (schedule chip, cards, day panel), so they all say the same
 * thing.
 */
export function dayHeaderLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const month = SHORT_MONTH_LABELS[(m - 1 + 12) % 12]?.toLowerCase() ?? '';
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const weekday = WEEKDAY_SHORT_BY_DAY[date.getUTCDay()] ?? '';
  return weekday ? `${weekday}, ${d} ${month}` : `${d} ${month}`;
}

/** Just the day + month, no weekday — for places already grouped by weekday. */
export function dayMonthLabel(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${SHORT_MONTH_LABELS[(m - 1 + 12) % 12]?.toLowerCase() ?? ''}`;
}

/** Move (year, month0) by `delta` months, normalizing overflow. */
export function shiftMonth(year: number, month0: number, delta: number): { year: number; month0: number } {
  const total = year * 12 + month0 + delta;
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
}

/**
 * A 6-week (42-cell) MONDAY-first grid for the given month, including the
 * leading/trailing spillover days so the grid is always rectangular.
 */
export function monthGrid(year: number, month0: number, todayKey?: string): CalendarCell[] {
  const first = new Date(Date.UTC(year, month0, 1));
  // 0=Sun..6=Sat → 0=Mon..6=Sun, so the grid's first column is Monday.
  const firstWeekday = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - firstWeekday);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const key = dateKey(y, m, day);
    cells.push({ key, day, inMonth: m === month0, isToday: !!todayKey && key === todayKey });
  }
  return cells;
}

/** Group scheduled pieces by their scheduled_date day key. Unscheduled are skipped. */
export function groupByScheduledDate(pieces: ReadonlyArray<ContentPiece>): Map<string, ContentPiece[]> {
  const map = new Map<string, ContentPiece[]>();
  for (const p of pieces) {
    if (!p.scheduledDate) continue;
    const key = p.scheduledDate.slice(0, 10); // normalize any timestamp to YYYY-MM-DD
    const arr = map.get(key);
    if (arr) arr.push(p);
    else map.set(key, [p]);
  }
  return map;
}

const WEEKDAY_FULL = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];

/**
 * Agenda group heading for a day key, e.g. "Сьогодні · 30 лип" / "Завтра · 31 лип"
 * / "2 сер · субота" — the date-grouped agenda pattern (Craft / Superlist), which
 * is how the app answers "what am I posting today, and next?".
 */
export function agendaHeading(key: string, todayKey: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  // No weekday here — this heading spells the weekday out in full below, and
  // «Сьогодні» / «Завтра» already say which day it is.
  const short = dayMonthLabel(key);

  if (key === todayKey) return `Сьогодні · ${short}`;

  const [ty, tm, td] = todayKey.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(ty, (tm || 1) - 1, td || 1));
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowKey = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(
    tomorrow.getUTCDate(),
  ).padStart(2, '0')}`;
  if (key === tomorrowKey) return `Завтра · ${short}`;

  return `${short} · ${WEEKDAY_FULL[date.getUTCDay()]}`;
}

/** Sorted day keys (ascending) present in the given pieces' scheduled dates. */
export function sortedDayKeys(dates: ReadonlyArray<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const d of dates) if (d) set.add(d.slice(0, 10));
  return [...set].sort();
}
