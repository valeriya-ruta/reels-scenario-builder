/**
 * Producer insights (§7) — pure, derived from the user's own content.
 *
 * IMPORTANT about what these are NOT. There is no Instagram analytics ingestion
 * in this app, so nothing here is reach, views or engagement. Everything is
 * OUTPUT: what got published, how steadily, what is still waiting. Inventing a
 * reach number would put a lie on the home screen, and the home screen is the
 * one place a number has to be trustworthy.
 *
 * When the IG integration lands, this module is the seam: the shape stays, the
 * inputs gain reach.
 */

import type { ContentPiece } from '@/lib/content/contentPiece';

export type WeekBucket = {
  /** Monday of the week, 'YYYY-MM-DD'. */
  weekStart: string;
  published: number;
};

export type ProducerInsights = {
  publishedThisWeek: number;
  publishedLastWeek: number;
  /** Consecutive weeks (ending with the current one) that saw a publish. */
  streakWeeks: number;
  /** Committed pieces dated today or later. */
  plannedAhead: number;
  /** Kept but undated — mirrors the Розбір count. */
  waiting: number;
  /** Last 7 weeks, oldest first, for the sparkline. */
  weeks: WeekBucket[];
  /** Share of all non-idea pieces that reached Опубліковано, 0..1. */
  publishedShare: number;
  total: number;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Monday of the week containing `key` ('YYYY-MM-DD'), in UTC. */
export function weekStartOf(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  // getUTCDay: 0=Sun. Shift so Monday is the first day of the week.
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function addWeeks(weekStart: string, delta: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + delta * 7);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * A piece counts as published in the week it was last touched. `updated_at` is
 * the only timestamp available — there is no published_at column — so this is
 * an approximation, and a deliberate one: adding a column for a home-screen
 * number would be a schema change for a stat.
 */
function publishedWeek(piece: ContentPiece): string {
  return weekStartOf(piece.updatedAt.slice(0, 10));
}

export const INSIGHT_WEEKS = 7;

export function buildProducerInsights(
  pieces: ReadonlyArray<ContentPiece>,
  todayKey: string,
): ProducerInsights {
  const real = pieces.filter((p) => p.refTable !== 'ideas');
  const published = real.filter((p) => p.status === 'published');

  const thisWeek = weekStartOf(todayKey);
  const lastWeek = addWeeks(thisWeek, -1);

  const byWeek = new Map<string, number>();
  for (const p of published) {
    const w = publishedWeek(p);
    byWeek.set(w, (byWeek.get(w) ?? 0) + 1);
  }

  const weeks: WeekBucket[] = [];
  for (let i = INSIGHT_WEEKS - 1; i >= 0; i--) {
    const weekStart = addWeeks(thisWeek, -i);
    weeks.push({ weekStart, published: byWeek.get(weekStart) ?? 0 });
  }

  // Streak counts back from the current week. The current week is allowed to be
  // empty without breaking it — it is still in progress, and punishing someone
  // on a Monday morning for not having posted yet is the opposite of a nudge.
  let streakWeeks = 0;
  for (let i = 0; i < 260; i++) {
    const w = addWeeks(thisWeek, -i);
    const count = byWeek.get(w) ?? 0;
    if (count > 0) {
      streakWeeks++;
      continue;
    }
    if (i === 0) continue;
    break;
  }

  return {
    publishedThisWeek: byWeek.get(thisWeek) ?? 0,
    publishedLastWeek: byWeek.get(lastWeek) ?? 0,
    streakWeeks,
    plannedAhead: real.filter((p) => (p.scheduledDate ?? '') >= todayKey).length,
    waiting: real.filter((p) => !p.scheduledDate && p.status !== 'published').length,
    weeks,
    publishedShare: real.length === 0 ? 0 : published.length / real.length,
    total: real.length,
  };
}

/** «на 2 більше ніж минулого тижня» — the comparison, or null when flat. */
export function weekOverWeekLabel(insights: ProducerInsights): string | null {
  const delta = insights.publishedThisWeek - insights.publishedLastWeek;
  if (delta === 0) return null;
  return delta > 0
    ? `+${delta} до минулого тижня`
    : `${delta} до минулого тижня`;
}
