/**
 * The ONE insights model: how posted pieces are measured, ranked and flagged
 * (Prompt 8). Pure — no I/O, no React — so the Insights tab, the Home
 * «Статистика» preview and the per-post view all read the same numbers through
 * the same functions. The preview is a preview, never a second system.
 *
 * WHAT SEPTEMBER ACTUALLY HAS: views, likes, comments — that is the whole
 * scrapeable set (see apifyInsights for why). Reach, saves, watch time,
 * retention and source-of-views are Graph-era metrics Instagram publishes only
 * to the account owner; nothing here pretends otherwise, and no surface renders
 * an empty shell for them.
 */

import { isWinner, primaryMetric, type InsightsPayload } from '@/lib/insights/postedLink';
import type { ContentPiece } from '@/lib/content/contentPiece';

/** Metrics the user can sort by. `date` is newest-first. */
export type InsightsSort = 'views' | 'likes' | 'comments' | 'date';

export const SORT_LABELS: Record<InsightsSort, string> = {
  views: 'Перегляди',
  likes: 'Вподобання',
  comments: 'Коментарі',
  date: 'Дата',
};

/** Reach/views ↓ is the default — the number the user actually cares about. */
export const DEFAULT_SORT: InsightsSort = 'views';

export const SORT_ORDER: readonly InsightsSort[] = ['views', 'likes', 'comments', 'date'] as const;

export type MetricKey = 'views' | 'likes' | 'comments';

export const METRIC_LABELS: Record<MetricKey, string> = {
  views: 'переглядів',
  likes: 'вподобань',
  comments: 'коментарів',
};

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** One metric off a piece, or null when the scrape doesn't carry it. */
export function metric(piece: ContentPiece, key: MetricKey): number | null {
  return numeric((piece.insights ?? {})[key]);
}

/** Everything the user has logged a link for — the population of the tab. */
export function postedPieces(pieces: ReadonlyArray<ContentPiece>): ContentPiece[] {
  return pieces.filter((p) => p.refTable !== 'ideas' && Boolean(p.postedUrl));
}

/**
 * Posted, but nothing pulled back yet. Rendered as «дані скоро» with a clock —
 * NEVER as zeros. A fresh post showing "0 переглядів" reads as a flop, and the
 * user would act on a number the app invented.
 */
export function isPending(piece: ContentPiece): boolean {
  const m = piece.insights;
  if (!m) return true;
  return metric(piece, 'views') === null && metric(piece, 'likes') === null && metric(piece, 'comments') === null;
}

/**
 * The thumbnail the scrape returned, if any. Instagram CDN URLs expire, so the
 * caller must degrade gracefully rather than reserve a broken box.
 */
export function thumbnailUrl(piece: ContentPiece): string | null {
  const raw = (piece.insights as InsightsPayload | null | undefined)?.thumbnail;
  return typeof raw === 'string' && raw.startsWith('http') ? raw : null;
}

/** When it went live, best available. */
export function postedTime(piece: ContentPiece): number {
  const iso = piece.postedAt ?? piece.updatedAt;
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Sort posted pieces. Pieces with no value for the chosen metric sink to the
 * bottom instead of being treated as zeros — «not pulled yet» is not «did
 * badly», and mixing the two would poison the top-performer pick.
 */
export function rankPosted(
  pieces: ReadonlyArray<ContentPiece>,
  sort: InsightsSort = DEFAULT_SORT,
): ContentPiece[] {
  const list = [...pieces];
  if (sort === 'date') {
    return list.sort((a, b) => postedTime(b) - postedTime(a));
  }
  return list.sort((a, b) => {
    const av = metric(a, sort);
    const bv = metric(b, sort);
    if (av === null && bv === null) return postedTime(b) - postedTime(a);
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });
}

/**
 * Winner detection on the scrapeable set alone (Prompt 8): a piece that beat
 * this account's own median by a clear margin. Relative, because 900 views is a
 * triumph on one account and a disappointment on another.
 */
export function winnerIds(posted: ReadonlyArray<ContentPiece>): Set<string> {
  const values = posted
    .map((p) => primaryMetric(p.insights))
    .filter((v): v is number => v !== null);
  return new Set(
    posted.filter((p) => isWinner(primaryMetric(p.insights), values)).map((p) => p.id),
  );
}

/**
 * The piece that earns the highlight card. A flagged winner first — that is the
 * object that also feeds the idea deck and reopens its braindump for the «this
 * worked, go deeper» prompt — otherwise simply the best on the current sort.
 */
export function topPerformer(
  ranked: ReadonlyArray<ContentPiece>,
  winners: ReadonlySet<string>,
): ContentPiece | null {
  const withData = ranked.filter((p) => !isPending(p));
  return withData.find((p) => winners.has(p.id)) ?? withData[0] ?? null;
}

/** «12 345» — thousands separated, Ukrainian locale. */
export function formatMetric(value: number): string {
  return value.toLocaleString('uk-UA');
}
