import { test, expect } from '@playwright/test';
import { normalizeApifyPost } from '@/lib/insights/apifyNormalize';

/**
 * Normalisation of `apify/instagram-scraper` dataset items.
 *
 * The rule that matters: an absent metric is OMITTED, never zeroed. A photo
 * carousel has no view count, and storing 0 would render as "0 переглядів" —
 * a post that flopped, rather than a metric that does not apply.
 */

test.describe('apify post → insights payload', () => {
  test('maps a reel: views, likes, comments', () => {
    const out = normalizeApifyPost({
      likesCount: 412,
      commentsCount: 37,
      videoViewCount: 10432,
      videoPlayCount: 11000,
      videoDuration: 41.2,
      shortCode: 'ABC123xyz',
      productType: 'clips',
      timestamp: '2026-07-30T09:00:00.000Z',
    });
    expect(out).toMatchObject({ views: 10432, likes: 412, comments: 37, shortcode: 'ABC123xyz' });
  });

  test('falls back to play count when view count is missing', () => {
    const out = normalizeApifyPost({ likesCount: 5, videoPlayCount: 900 });
    expect(out?.views).toBe(900);
  });

  test('a photo carousel omits views rather than reporting zero', () => {
    const out = normalizeApifyPost({ likesCount: 120, commentsCount: 4 });
    expect(out).toMatchObject({ likes: 120, comments: 4 });
    expect('views' in (out ?? {})).toBe(false);
  });

  test('a genuine zero is kept — 0 likes is a fact, not a missing value', () => {
    const out = normalizeApifyPost({ likesCount: 0, commentsCount: 0 });
    expect(out).toMatchObject({ likes: 0, comments: 0 });
  });

  test('an errored, private or deleted post yields null', () => {
    expect(normalizeApifyPost({ error: 'not_found', errorDescription: 'gone' })).toBeNull();
    expect(normalizeApifyPost({})).toBeNull();
    expect(normalizeApifyPost(null)).toBeNull();
  });

  test('rejects nonsense values instead of storing them', () => {
    expect(normalizeApifyPost({ likesCount: -5, commentsCount: 'many' })).toBeNull();
    expect(normalizeApifyPost({ likesCount: Number.NaN })).toBeNull();
  });

  test('stamps the provider so a stored payload is always traceable', () => {
    expect(normalizeApifyPost({ likesCount: 1 })?.provider).toBe('apify/instagram-scraper');
  });

  test('never invents reach or saves — the scraper cannot see them', () => {
    // Guards against a future actor swap quietly introducing fields the UI
    // would then present as real owner metrics.
    const out = normalizeApifyPost({ likesCount: 10, videoViewCount: 100 }) ?? {};
    expect('reach' in out).toBe(false);
    expect('saves' in out).toBe(false);
  });
});
