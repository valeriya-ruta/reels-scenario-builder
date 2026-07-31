/**
 * Posted links — the fact the whole insights + gamification loop hangs off
 * (Prompt 1). Pure: no I/O, so the URL rules and the tier maths are testable.
 */

/** Where a piece's metrics came from. `graph` is reserved, never written yet. */
export type InsightsSource = 'apify' | 'graph';

/** Metrics as pulled. Deliberately loose — the shape is the scraper's, not ours. */
export type InsightsPayload = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  [key: string]: unknown;
};

export type PostedFields = {
  postedUrl: string | null;
  postedAt: string | null;
  insightsSource: InsightsSource;
  insights: InsightsPayload | null;
  insightsFetchedAt: string | null;
};

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'instagr.am']);

/**
 * Accept a pasted Instagram post/reel URL, or reject it with a reason.
 *
 * Deliberately permissive about what the user pastes (share sheets add
 * `?igsh=…`, people paste with trailing spaces) and strict about what we store:
 * the canonical `https://www.instagram.com/<kind>/<code>/`. Storing the raw
 * share URL would mean the same post logs as two different links and counts
 * twice toward the coin.
 */
export type ParsedPostUrl =
  | { ok: true; url: string; shortcode: string; kind: 'p' | 'reel' | 'tv' }
  | { ok: false; error: string };

export function parseInstagramPostUrl(raw: string): ParsedPostUrl {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, error: 'Встав посилання на пост.' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, error: 'Це не схоже на посилання.' };
  }

  if (!INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase())) {
    return { ok: false, error: 'Поки що приймаємо тільки посилання з Instagram.' };
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const kindIndex = segments.findIndex((s) => s === 'p' || s === 'reel' || s === 'reels' || s === 'tv');
  if (kindIndex === -1 || !segments[kindIndex + 1]) {
    return {
      ok: false,
      error: 'Потрібне посилання на конкретний пост або рілс, не на профіль.',
    };
  }

  const rawKind = segments[kindIndex];
  // Instagram serves both /reel/ and /reels/; canonicalise to the singular.
  const kind: 'p' | 'reel' | 'tv' = rawKind === 'reels' ? 'reel' : (rawKind as 'p' | 'reel' | 'tv');
  const shortcode = segments[kindIndex + 1];
  if (!/^[A-Za-z0-9_-]{5,}$/.test(shortcode)) {
    return { ok: false, error: 'Не вдалося розпізнати посилання на пост.' };
  }

  return {
    ok: true,
    // Canonical form — query strings and share tokens dropped, so the same post
    // pasted twice is recognised as the same post.
    url: `https://www.instagram.com/${kind}/${shortcode}/`,
    shortcode,
    kind,
  };
}

/**
 * Reward tiers for the submission coin.
 *
 * Labels are PLACEHOLDERS by instruction — the mechanic and the numbers are
 * real, the prizes are not decided. They live here so renaming a reward is a
 * one-line change and never a code change.
 */
export type Tier = { threshold: number; label: string };

export const TIERS: readonly Tier[] = [
  { threshold: 5, label: 'Перша нагорода' },
  { threshold: 15, label: 'Друга нагорода' },
  { threshold: 30, label: 'Третя нагорода' },
  { threshold: 60, label: 'Четверта нагорода' },
] as const;

export type TierProgress = {
  count: number;
  /** The tier being worked toward, or null once every tier is cleared. */
  next: Tier | null;
  /** Posts still needed. 0 when all tiers are done. */
  remaining: number;
  /** Progress toward `next` within its own band, 0..1. */
  fraction: number;
  /** Highest tier already reached, or null. */
  reached: Tier | null;
};

export function tierProgress(count: number, tiers: readonly Tier[] = TIERS): TierProgress {
  const safe = Math.max(0, Math.floor(count));
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);

  const next = sorted.find((t) => safe < t.threshold) ?? null;
  const reached = [...sorted].reverse().find((t) => safe >= t.threshold) ?? null;
  const floor = reached?.threshold ?? 0;

  if (!next) return { count: safe, next: null, remaining: 0, fraction: 1, reached };

  const span = Math.max(1, next.threshold - floor);
  return {
    count: safe,
    next,
    remaining: next.threshold - safe,
    fraction: Math.min(1, Math.max(0, (safe - floor) / span)),
    reached,
  };
}

/** «Ще 3 пости до…» — the motivating line, shared by the pop-up and the coin page. */
export function remainingLabel(progress: TierProgress): string {
  if (!progress.next) return 'Ти зібрала всі нагороди';
  const n = progress.remaining;
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? 'пост' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'пости' : 'постів';
  return `Ще ${n} ${word} до «${progress.next.label}»`;
}

/**
 * Is this a strong performer? Feeds the idea deck's quality promotion and the
 * "this worked — go deeper" prompt on the source braindump (Prompt 4).
 *
 * Relative, not absolute: a 900-view post is a triumph on one account and a
 * disappointment on another, so a winner is one that beat the user's own median
 * by a clear margin. Requires a few posts to compare against — below that,
 * nothing is a winner, because there is no baseline to be a winner against.
 */
export const WINNER_MULTIPLE = 1.5;
export const WINNER_MIN_SAMPLE = 4;

export function primaryMetric(insights: InsightsPayload | null | undefined): number | null {
  if (!insights) return null;
  const value = insights.views ?? insights.reach ?? insights.likes;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function isWinner(value: number | null, allValues: number[]): boolean {
  if (value === null) return false;
  const comparable = allValues.filter((v) => Number.isFinite(v));
  if (comparable.length < WINNER_MIN_SAMPLE) return false;
  const base = median(comparable);
  if (base <= 0) return false;
  return value >= base * WINNER_MULTIPLE;
}
