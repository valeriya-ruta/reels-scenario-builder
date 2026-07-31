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
  test('a reel reports PLAYS as views — real values from a live run', () => {
    // Verified against apify/instagram-scraper on a real account. The two
    // fields disagree by two orders of magnitude, and `videoPlayCount` is the
    // number Instagram shows the creator.
    const out = normalizeApifyPost({
      likesCount: 57,
      commentsCount: 2,
      videoViewCount: 28,
      videoPlayCount: 2345,
      videoDuration: 24.961,
      shortCode: 'DbDYzFKtF_y',
      productType: 'clips',
      timestamp: '2026-07-21T11:17:12.000Z',
    });
    // Taking videoViewCount here would report 28 and make every reel look like
    // a flop — inverting winner detection, which compares to the own median.
    expect(out?.views).toBe(2345);
    expect(out).toMatchObject({ likes: 57, comments: 2, shortcode: 'DbDYzFKtF_y' });
  });

  test('falls back to videoViewCount only when there is no play count', () => {
    const out = normalizeApifyPost({ likesCount: 5, videoViewCount: 900 });
    expect(out?.views).toBe(900);
  });

  test('a photo carousel omits views rather than reporting zero', () => {
    // Real shape from a live run: a Sidecar carries no video counters at all.
    const out = normalizeApifyPost({
      likesCount: 31,
      commentsCount: 3,
      shortCode: 'DWkv1rFiL8Q',
      productType: 'carousel_container',
      timestamp: '2026-04-01T03:36:03.000Z',
    });
    expect(out).toMatchObject({ likes: 31, comments: 3 });
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
