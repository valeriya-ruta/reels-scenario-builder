import { test, expect } from '@playwright/test';
import {
  DEFAULT_SORT,
  isPending,
  metric,
  postedPieces,
  rankPosted,
  thumbnailUrl,
  topPerformer,
  winnerIds,
} from '../lib/insights/postedRanking';
import { unfinishedLine } from '../lib/content/staging';
import type { ContentPiece } from '../lib/content/contentPiece';
import type { InsightsPayload } from '../lib/insights/postedLink';

/**
 * The insights model shared by the tab, the Home preview and the per-post view
 * (Prompt 8). Browser-free: this is the arithmetic the whole loop hangs off.
 */

let n = 0;
function piece(over: Partial<ContentPiece> & { insights?: InsightsPayload | null }): ContentPiece {
  n += 1;
  return {
    id: over.id ?? `p${n}`,
    userId: 'u',
    type: 'reel',
    status: 'published',
    title: `Пост ${n}`,
    refTable: 'projects',
    scheduledDate: null,
    postedUrl: 'https://www.instagram.com/p/AAAAA/',
    postedAt: '2026-07-01T00:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  } as ContentPiece;
}

test.describe('posted ranking', () => {
  test('the population is pieces WITH a link — ideas and unposted drafts are out', () => {
    const all = [
      piece({ id: 'linked' }),
      piece({ id: 'draft', postedUrl: null, status: 'script' }),
      piece({ id: 'idea', refTable: 'ideas', type: 'idea', postedUrl: 'https://x/p/a/' }),
    ];
    expect(postedPieces(all).map((p) => p.id)).toEqual(['linked']);
  });

  test('default sort is views, descending', () => {
    expect(DEFAULT_SORT).toBe('views');
    const list = [
      piece({ id: 'low', insights: { views: 100 } }),
      piece({ id: 'high', insights: { views: 9000 } }),
      piece({ id: 'mid', insights: { views: 1200 } }),
    ];
    expect(rankPosted(list, 'views').map((p) => p.id)).toEqual(['high', 'mid', 'low']);
  });

  test('re-sorting by likes and comments changes the order', () => {
    const list = [
      piece({ id: 'a', insights: { views: 9000, likes: 10, comments: 90 } }),
      piece({ id: 'b', insights: { views: 100, likes: 800, comments: 1 } }),
    ];
    expect(rankPosted(list, 'likes').map((p) => p.id)).toEqual(['b', 'a']);
    expect(rankPosted(list, 'comments').map((p) => p.id)).toEqual(['a', 'b']);
  });

  test('date sort is newest first', () => {
    const list = [
      piece({ id: 'old', postedAt: '2026-01-01T00:00:00.000Z', insights: { views: 9000 } }),
      piece({ id: 'new', postedAt: '2026-07-20T00:00:00.000Z', insights: { views: 1 } }),
    ];
    expect(rankPosted(list, 'date').map((p) => p.id)).toEqual(['new', 'old']);
  });

  test('an unpulled post sinks — "no data" is never treated as zero', () => {
    const list = [
      piece({ id: 'pending', insights: null }),
      piece({ id: 'weak', insights: { views: 3 } }),
    ];
    expect(rankPosted(list, 'views').map((p) => p.id)).toEqual(['weak', 'pending']);
    expect(isPending(list[0])).toBe(true);
    expect(isPending(list[1])).toBe(false);
    // …and it reports no metric rather than a fabricated 0.
    expect(metric(list[0], 'views')).toBeNull();
  });

  test('a carousel with likes but no views is not "pending"', () => {
    const p = piece({ type: 'carousel', insights: { likes: 40, comments: 2 } });
    expect(isPending(p)).toBe(false);
    expect(metric(p, 'views')).toBeNull();
    expect(metric(p, 'likes')).toBe(40);
  });

  test('winner detection runs on the scrapeable set, relative to the own median', () => {
    // Median of 100/100/100/100 is 100; 900 clears the 1.5× bar.
    const list = [
      piece({ id: 'w', insights: { views: 900 } }),
      piece({ id: 'a', insights: { views: 100 } }),
      piece({ id: 'b', insights: { views: 100 } }),
      piece({ id: 'c', insights: { views: 100 } }),
      piece({ id: 'd', insights: { views: 100 } }),
    ];
    const winners = winnerIds(list);
    expect(winners.has('w')).toBe(true);
    expect(winners.has('a')).toBe(false);
  });

  test('the highlight card prefers a flagged winner, then falls back to the best', () => {
    const withWinner = [
      piece({ id: 'w', insights: { views: 900 } }),
      piece({ id: 'a', insights: { views: 100 } }),
      piece({ id: 'b', insights: { views: 100 } }),
      piece({ id: 'c', insights: { views: 100 } }),
      piece({ id: 'd', insights: { views: 100 } }),
    ];
    const ranked = rankPosted(withWinner, 'views');
    expect(topPerformer(ranked, winnerIds(withWinner))?.id).toBe('w');

    // Too small a sample to call anything a winner → still highlights the best.
    const noWinner = [piece({ id: 'x', insights: { views: 50 } })];
    expect(topPerformer(rankPosted(noWinner, 'views'), winnerIds(noWinner))?.id).toBe('x');

    // Nothing pulled yet → nothing to celebrate.
    expect(topPerformer([piece({ id: 'p', insights: null })], new Set())).toBeNull();
  });

  test('thumbnails only come from a real http url', () => {
    expect(thumbnailUrl(piece({ insights: { thumbnail: 'https://cdn/x.jpg' } }))).toBe(
      'https://cdn/x.jpg',
    );
    expect(thumbnailUrl(piece({ insights: { thumbnail: '' } }))).toBeNull();
    expect(thumbnailUrl(piece({ insights: null }))).toBeNull();
  });
});

test.describe('inbox pressure line', () => {
  test('is pressure, not storage — and gets Ukrainian plurals right', () => {
    expect(unfinishedLine(1)).toBe('1 ідея не завершена — давай її завершимо!');
    expect(unfinishedLine(3)).toBe('3 ідеї не завершені — давай їх завершимо!');
    expect(unfinishedLine(42)).toBe('42 ідеї не завершені — давай їх завершимо!');
    expect(unfinishedLine(5)).toBe('5 ідей не завершені — давай їх завершимо!');
    expect(unfinishedLine(11)).toBe('11 ідей не завершені — давай їх завершимо!');
    expect(unfinishedLine(14)).toBe('14 ідей не завершені — давай їх завершимо!');
    expect(unfinishedLine(21)).toBe('21 ідея не завершена — давай її завершимо!');
  });
});
