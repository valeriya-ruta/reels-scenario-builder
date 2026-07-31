import { test, expect } from '@playwright/test';
import {
  parseInstagramPostUrl,
  tierProgress,
  remainingLabel,
  isWinner,
  median,
  primaryMetric,
  TIERS,
  WINNER_MIN_SAMPLE,
} from '@/lib/insights/postedLink';

/**
 * Prompt 1's logic. The URL is the anchor for everything downstream — the
 * insights pull, the coin count, winner detection — so the two things that
 * matter are: accept what people actually paste, and STORE one canonical form
 * so the same post can never count twice.
 */

test.describe('pasted post URLs', () => {
  test('canonicalises reel, reels, p and tv to one stored form', () => {
    for (const input of [
      'https://www.instagram.com/reel/ABC123xyz/',
      'https://instagram.com/reels/ABC123xyz',
      'instagram.com/reel/ABC123xyz/',
    ]) {
      const out = parseInstagramPostUrl(input);
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.url).toBe('https://www.instagram.com/reel/ABC123xyz/');
    }
    const post = parseInstagramPostUrl('https://www.instagram.com/p/ABC123xyz/');
    expect(post.ok && post.url).toBe('https://www.instagram.com/p/ABC123xyz/');
  });

  test('strips share tokens, so one post pasted twice is ONE link', () => {
    const a = parseInstagramPostUrl('https://www.instagram.com/reel/ABC123xyz/?igsh=Zm9vYmFy&utm_source=ig');
    const b = parseInstagramPostUrl('https://www.instagram.com/reel/ABC123xyz/');
    expect(a.ok && b.ok && a.url === b.url).toBe(true);
  });

  test('tolerates whitespace and a missing scheme', () => {
    expect(parseInstagramPostUrl('  www.instagram.com/p/ABC123xyz/  ').ok).toBe(true);
  });

  test('rejects a profile link with a reason the user can act on', () => {
    const out = parseInstagramPostUrl('https://www.instagram.com/valeriya.ruta/');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('профіль');
  });

  test('rejects other hosts, junk and empty input', () => {
    expect(parseInstagramPostUrl('https://tiktok.com/@x/video/123').ok).toBe(false);
    expect(parseInstagramPostUrl('не посилання').ok).toBe(false);
    expect(parseInstagramPostUrl('').ok).toBe(false);
  });
});

test.describe('tier progress', () => {
  test('counts toward the first tier from zero', () => {
    const p = tierProgress(0);
    expect(p.next?.threshold).toBe(TIERS[0].threshold);
    expect(p.remaining).toBe(TIERS[0].threshold);
    expect(p.reached).toBeNull();
    expect(p.fraction).toBe(0);
  });

  test('moves to the next tier once one is cleared', () => {
    const p = tierProgress(TIERS[0].threshold);
    expect(p.reached?.threshold).toBe(TIERS[0].threshold);
    expect(p.next?.threshold).toBe(TIERS[1].threshold);
    expect(p.remaining).toBe(TIERS[1].threshold - TIERS[0].threshold);
    // Fraction restarts within the NEW band, not against the whole scale.
    expect(p.fraction).toBe(0);
  });

  test('saturates once every tier is cleared, without going negative', () => {
    const p = tierProgress(9999);
    expect(p.next).toBeNull();
    expect(p.remaining).toBe(0);
    expect(p.fraction).toBe(1);
    expect(remainingLabel(p)).toContain('всі нагороди');
  });

  test('negative or fractional counts are clamped rather than trusted', () => {
    expect(tierProgress(-5).count).toBe(0);
    expect(tierProgress(3.7).count).toBe(3);
  });

  test('the motivating line uses correct Ukrainian plurals', () => {
    expect(remainingLabel(tierProgress(TIERS[0].threshold - 1))).toContain('1 пост');
    expect(remainingLabel(tierProgress(TIERS[0].threshold - 3))).toContain('3 пости');
    expect(remainingLabel(tierProgress(0))).toContain(`${TIERS[0].threshold} постів`);
  });
});

test.describe('winner detection', () => {
  test('is RELATIVE — a winner beats the account\'s own median', () => {
    const others = [100, 120, 90, 110, 105];
    expect(median(others)).toBe(105);
    expect(isWinner(200, [...others, 200])).toBe(true);
    expect(isWinner(120, [...others, 120])).toBe(false);
  });

  test('needs a baseline: nothing is a winner on a brand-new account', () => {
    // With two posts there is no median worth beating, so promoting one as a
    // "winner" would be noise dressed as a signal.
    expect(isWinner(9999, [10, 9999])).toBe(false);
    expect(WINNER_MIN_SAMPLE).toBeGreaterThan(2);
  });

  test('an unpulled or malformed payload is never a winner', () => {
    expect(primaryMetric(null)).toBeNull();
    expect(primaryMetric({})).toBeNull();
    expect(primaryMetric({ views: 'many' } as never)).toBeNull();
    expect(isWinner(null, [1, 2, 3, 4, 5])).toBe(false);
  });

  test('falls back through views → reach → likes', () => {
    expect(primaryMetric({ views: 10, reach: 20, likes: 30 })).toBe(10);
    expect(primaryMetric({ reach: 20, likes: 30 })).toBe(20);
    expect(primaryMetric({ likes: 30 })).toBe(30);
  });
});
