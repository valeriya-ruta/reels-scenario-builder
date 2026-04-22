import type { IdeaTopReelItem, IdeaTopReelsPayload } from '@/lib/ideaScanTypes';

export interface RawReelInput {
  shortCode: string;
  url: string;
  videoUrl: string;
  hook: string;
  templatePattern: string;
  templateLines: string[];
  plays: number;
  likes: number;
  comments: number;
}

const W_PLAY = 0.4;
const W_LIKE = 0.35;
const W_COMMENT = 0.25;
/** When `likes === -1` (hidden), like weight is dropped: play + comment only. */
const W_PLAY_HIDDEN_LIKES = 0.55;
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
 * accountAvgPlays: mean of min(play, P80) over reels with plays &gt; 0.
 * Same cap rule as before — used as denominator for playScore.
 */
function accountAvgPlaysFromReels(reels: RawReelInput[]): number {
  const pool = reels.filter((r) => r.plays > 0);
  const n = pool.length;
  if (n === 0) return 0;

  const playsAsc = [...pool.map((r) => r.plays)].sort((a, b) => a - b);
  const cap = percentileCap(playsAsc, Math.floor(n * 0.8));

  let sumCappedP = 0;
  for (const r of pool) {
    sumCappedP += Math.min(r.plays, cap);
  }
  return sumCappedP / n;
}

function viralScoreForReel(reel: RawReelInput, accountAvgPlays: number): number {
  if (reel.plays <= 0 || accountAvgPlays <= 0) return 0;

  const playScore = reel.plays / accountAvgPlays;
  const commentRatio = reel.comments / reel.plays;

  if (reel.likes === -1) {
    return playScore * W_PLAY_HIDDEN_LIKES + commentRatio * W_COMMENT_HIDDEN_LIKES;
  }

  const likeRatio = reel.likes / reel.plays;
  return (
    playScore * W_PLAY + likeRatio * W_LIKE + commentRatio * W_COMMENT
  );
}

/** «Вірусний» only when reel plays ≥ 2× account followers (scoring uses ratios, unchanged). */
function isReelViralByFollowerThreshold(
  reel: RawReelInput,
  followersCount: number
): boolean {
  const fc = Math.max(0, Math.round(followersCount));
  if (fc <= 0 || reel.plays <= 0) return false;
  return reel.plays >= 2 * fc;
}

/**
 * Computes top reels and summary from raw Apify-normalized rows.
 * Reels with plays === 0 are excluded (no ratios).
 * @param followersCount — profile followers from the scan; used only for `isViral` / `qualifiedCount`.
 */
export function computeTopReelsPayload(
  reels: RawReelInput[],
  followersCount: number
): IdeaTopReelsPayload {
  const followerCountSafe = Math.max(0, Math.round(followersCount));
  const accountAvgPlays = accountAvgPlaysFromReels(reels);
  const pool = reels.filter((r) => r.plays > 0);
  const reelsAnalyzed = pool.length;

  const scored = pool
    .map((r) => ({
      reel: r,
      viralScore: viralScoreForReel(r, accountAvgPlays),
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
      plays: r.plays,
      likesCount: r.likes,
      commentsCount: r.comments,
      isViral: isReelViralByFollowerThreshold(r, followerCountSafe),
    };
  });

  return {
    summary: {
      reelsAnalyzed,
      avgPlaysDisplay: formatCompactCount(accountAvgPlays),
      qualifiedCount,
    },
    items,
  };
}
