/**
 * Pure normalisation of `apify/instagram-scraper` dataset items (Prompt 4).
 *
 * Import-free on purpose — `apifyInsights.ts` is `server-only`, which throws
 * outside an RSC context, so the mapping lives here where it can be unit-tested
 * directly (same split as `storiesNormalize`).
 */

import type { InsightsPayload } from '@/lib/insights/postedLink';

/** Raw shape we care about from the actor's dataset item. */
type ApifyPostItem = {
  likesCount?: number | null;
  commentsCount?: number | null;
  videoViewCount?: number | null;
  videoPlayCount?: number | null;
  videoDuration?: number | null;
  timestamp?: string | null;
  shortCode?: string | null;
  type?: string | null;
  productType?: string | null;
  ownerUsername?: string | null;
  caption?: string | null;
  error?: string | null;
  errorDescription?: string | null;
};

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Map one dataset item to our payload. Absent metrics are OMITTED rather than
 * zeroed — a photo carousel has no view count, and writing 0 would render as
 * "0 переглядів", which reads as a failed post rather than an inapplicable
 * metric.
 */
export function normalizeApifyPost(raw: unknown): InsightsPayload | null {
  const item = (raw ?? {}) as ApifyPostItem;
  if (item.error) return null;

  const likes = num(item.likesCount);
  const comments = num(item.commentsCount);
  // Reels report plays and views separately; views is the headline number and
  // plays is the fallback when only it came back.
  const views = num(item.videoViewCount) ?? num(item.videoPlayCount);

  if (likes === undefined && comments === undefined && views === undefined) return null;

  return {
    ...(views !== undefined ? { views } : {}),
    ...(likes !== undefined ? { likes } : {}),
    ...(comments !== undefined ? { comments } : {}),
    ...(num(item.videoDuration) !== undefined ? { durationSec: num(item.videoDuration) } : {}),
    ...(item.timestamp ? { postedAt: item.timestamp } : {}),
    ...(item.shortCode ? { shortcode: item.shortCode } : {}),
    ...(item.productType ? { productType: item.productType } : {}),
    // Stamped so a stored payload can always be traced to how it was obtained.
    provider: 'apify/instagram-scraper',
  };
}

