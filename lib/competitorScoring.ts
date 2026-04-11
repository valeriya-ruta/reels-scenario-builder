import type { IdeaTopReelItem, IdeaTopReelsPayload } from '@/lib/ideaScanTypes';

export interface RawReelInput {
  shortCode: string;
  url: string;
  videoUrl: string;
  hook: string;
  templatePattern: string;
  templateLines: string[];
  videoViewCount: number;
  saves: number;
  likes: number;
  comments: number;
}

const W_VIEW = 0.4;
const W_LIKE = 0.35;
const W_COMMENT = 0.25;
/** When `likes === -1` (hidden), like weight is dropped: view + comment only. */
const W_VIEW_HIDDEN_LIKES = 0.55;
const W_COMMENT_HIDDEN_LIKES = 0.45;

export function formatCompactCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    const s = v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
    return `${s}M`;
  }
  if (abs >= 1_000) {
    const v = n / 1_000;
    const s = v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
    return `${s}K`;
  }
  return String(Math.round(n));
}

function percentileCap(sortedAsc: number[], pIndex: number): number {
  if (sortedAsc.length === 0) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, pIndex));
  return sortedAsc[i]!;
}

/**
 * accountAvgViews: mean of min(view, P80) over reels with views &gt; 0.
 * Same cap rule as before — used as denominator for viewScore.
 */
function accountAvgViewsFromReels(reels: RawReelInput[]): number {
  const pool = reels.filter((r) => r.videoViewCount > 0);
  const n = pool.length;
  if (n === 0) return 0;

  const viewsAsc = [...pool.map((r) => r.videoViewCount)].sort((a, b) => a - b);
  const cap = percentileCap(viewsAsc, Math.floor(n * 0.8));

  let sumCappedV = 0;
  for (const r of pool) {
    sumCappedV += Math.min(r.videoViewCount, cap);
  }
  return sumCappedV / n;
}

function viralScoreForReel(reel: RawReelInput, accountAvgViews: number): number {
  if (reel.videoViewCount <= 0 || accountAvgViews <= 0) return 0;

  const viewScore = reel.videoViewCount / accountAvgViews;
  const commentRatio = reel.comments / reel.videoViewCount;

  if (reel.likes === -1) {
    return viewScore * W_VIEW_HIDDEN_LIKES + commentRatio * W_COMMENT_HIDDEN_LIKES;
  }

  const likeRatio = reel.likes / reel.videoViewCount;
  return (
    viewScore * W_VIEW + likeRatio * W_LIKE + commentRatio * W_COMMENT
  );
}

function erPercent(reel: RawReelInput): number {
  const v = Math.max(1, reel.videoViewCount);
  const likes = reel.likes < 0 ? 0 : reel.likes;
  return ((likes + reel.saves + reel.comments) / v) * 100;
}

/** «Вірусний» only when reel views ≥ 2× account followers (scoring uses ratios, unchanged). */
function isReelViralByFollowerThreshold(
  reel: RawReelInput,
  followersCount: number
): boolean {
  const fc = Math.max(0, Math.round(followersCount));
  if (fc <= 0 || reel.videoViewCount <= 0) return false;
  return reel.videoViewCount >= 2 * fc;
}

/**
 * Computes top reels and summary from raw Apify-normalized rows.
 * Reels with videoViewCount === 0 are excluded (no ratios).
 * @param followersCount — profile followers from the scan; used only for `isViral` / `qualifiedCount`.
 */
export function computeTopReelsPayload(
  reels: RawReelInput[],
  followersCount: number
): IdeaTopReelsPayload {
  const followerCountSafe = Math.max(0, Math.round(followersCount));
  const accountAvgViews = accountAvgViewsFromReels(reels);
  const pool = reels.filter((r) => r.videoViewCount > 0);
  const reelsAnalyzed = pool.length;

  let sumEr = 0;
  for (const r of pool) {
    sumEr += erPercent(r);
  }
  const avgErDisplay =
    reelsAnalyzed > 0 ? `${(sumEr / reelsAnalyzed).toFixed(1)}%` : '0%';

  const scored = pool
    .map((r) => ({
      reel: r,
      viralScore: viralScoreForReel(r, accountAvgViews),
    }))
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, 10);

  const qualifiedCount = scored.filter((s) =>
    isReelViralByFollowerThreshold(s.reel, followerCountSafe)
  ).length;

  const items: IdeaTopReelItem[] = scored.map((s, i) => {
    const r = s.reel;
    return {
      rank: i + 1,
      shortCode: r.shortCode,
      url: r.url,
      videoUrl: r.videoUrl,
      hook: r.hook,
      templatePattern: r.templatePattern,
      templateLines: r.templateLines,
      videoViewCount: r.videoViewCount,
      savesCount: r.saves,
      likesCount: r.likes,
      commentsCount: r.comments,
      erPercent: erPercent(r),
      viralScore: s.viralScore,
      isViral: isReelViralByFollowerThreshold(r, followerCountSafe),
    };
  });

  return {
    summary: {
      reelsAnalyzed,
      avgViewsDisplay: formatCompactCount(accountAvgViews),
      avgErDisplay,
      qualifiedCount,
    },
    items,
  };
}
