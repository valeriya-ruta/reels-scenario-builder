import { optionalServerEnv, requireServerEnv } from '@/lib/env';
import { isAbsoluteHttpUrlString } from '@/lib/isAbsoluteHttpUrl';
import { DEFAULT_INSTAGRAM_REEL_SCRAPER_ACTOR } from '@/lib/ai/competitorReelsApify';
import { parseInstagramReelUrl } from '@/lib/instagramUrl';

const REFERENCE_PARSE_ERROR_MESSAGE =
  'Це не схоже на рілз 🤔 Скопіюй посилання прямо з Instagram (з кнопки «Поділитися» → «Копіювати посилання») і спробуй ще раз.';
const REFERENCE_NO_VIDEO_MESSAGE =
  'Не вдалося завантажити цей рілз. Можливо, він видалений, акаунт приватний, або це не відеопост.';
const IMPORT_MAX_ATTEMPTS = 3;
const IMPORT_TIMEOUT_MS = 60_000;
const IMPORT_BACKOFF_MS = [1_000, 3_000, 7_000] as const;

function walkCollectHttpUrls(val: unknown, depth: number, out: string[]): void {
  if (depth <= 0 || out.length >= 40) return;
  if (typeof val === 'string') {
    if (isAbsoluteHttpUrlString(val)) out.push(val.trim());
    return;
  }
  if (Array.isArray(val)) {
    for (const el of val) walkCollectHttpUrls(el, depth - 1, out);
    return;
  }
  if (val && typeof val === 'object') {
    for (const k of Object.keys(val as object)) {
      walkCollectHttpUrls((val as Record<string, unknown>)[k], depth - 1, out);
    }
  }
}

function looksLikeImageOnlyUrl(u: string): boolean {
  return /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(u);
}

function pickBestMediaUrl(urls: string[]): string | null {
  const uniq = [...new Set(urls)].filter((u) => !looksLikeImageOnlyUrl(u));
  if (uniq.length === 0) return null;
  const mp4 = uniq.find((u) => /\.mp4(\?|$)/i.test(u));
  if (mp4) return mp4;
  const cdn = uniq.find((u) => {
    try {
      return /fbcdn\.net|cdninstagram\.com|scontent/i.test(new URL(u).hostname);
    } catch {
      return false;
    }
  });
  return cdn ?? uniq[0];
}

function collectFromKeys(item: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const candidate = item[key];
    if (typeof candidate === 'string' && isAbsoluteHttpUrlString(candidate)) {
      out.push(candidate.trim());
    }
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry === 'object' && entry !== null && 'url' in entry) {
          const u = (entry as { url?: unknown }).url;
          if (typeof u === 'string' && isAbsoluteHttpUrlString(u)) {
            out.push(u.trim());
          }
        }
        if (typeof entry === 'string' && isAbsoluteHttpUrlString(entry)) {
          out.push(entry.trim());
        }
      }
    }
  }
  return out;
}

function pickMediaUrl(item: Record<string, unknown>): string | null {
  const videoKeys = ['videoUrl', 'video_url', 'videoHdUrl', 'video_versions'];
  const bestVideo = pickBestMediaUrl(collectFromKeys(item, videoKeys));
  if (bestVideo) return bestVideo;

  const deep: string[] = [];
  walkCollectHttpUrls(item, 6, deep);
  const bestDeep = pickBestMediaUrl(deep);
  if (bestDeep) return bestDeep;

  return pickBestMediaUrl(collectFromKeys(item, ['displayUrl', 'display_url']));
}

export interface InstagramMediaResult {
  normalizedUrl: string;
  mediaUrl: string;
  shortcode: string;
  attemptCount: number;
  firstAttemptAt: string;
  lastAttemptAt: string;
}

export class InstagramReferenceInputError extends Error {}
export class InstagramReferenceNoVideoError extends Error {}
export class InstagramReferenceSystemError extends Error {
  readonly attemptCount: number;
  readonly firstAttemptAt: string;
  readonly lastAttemptAt: string;
  readonly canonicalUrl: string;
  readonly shortcode: string;

  constructor(params: {
    message: string;
    attemptCount: number;
    firstAttemptAt: string;
    lastAttemptAt: string;
    canonicalUrl: string;
    shortcode: string;
  }) {
    super(params.message);
    this.attemptCount = params.attemptCount;
    this.firstAttemptAt = params.firstAttemptAt;
    this.lastAttemptAt = params.lastAttemptAt;
    this.canonicalUrl = params.canonicalUrl;
    this.shortcode = params.shortcode;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toJitter(baseMs: number): number {
  const jitter = Math.floor(Math.random() * 250);
  return baseMs + jitter;
}

function isRetryableApifyFailure(status: number): boolean {
  if (status === 429) return true;
  if (status >= 500) return true;
  if (status === 400 || status === 401 || status === 403 || status === 404) return false;
  return true;
}

function isRetryableFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();
  return (
    lowered.includes('timeout') ||
    lowered.includes('network') ||
    lowered.includes('fetch failed') ||
    lowered.includes('econnreset') ||
    lowered.includes('etimedout') ||
    lowered.includes('temporar') ||
    lowered.includes('rate limit')
  );
}

export async function resolveInstagramMediaUrl(reelUrl: string): Promise<InstagramMediaResult> {
  const parsed = parseInstagramReelUrl(reelUrl);
  if (!parsed.ok) {
    throw new InstagramReferenceInputError(REFERENCE_PARSE_ERROR_MESSAGE);
  }

  const token = requireServerEnv('APIFY_TOKEN');
  const actorId =
    optionalServerEnv('APIFY_INSTAGRAM_ACTOR_ID') ||
    DEFAULT_INSTAGRAM_REEL_SCRAPER_ACTOR;

  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  /** Input schema: `apify/instagram-reel-scraper` — reel or profile URL in `username` array */
  const payload = {
    username: [parsed.canonicalUrl],
    resultsLimit: 1,
  };

  const firstAttemptAt = new Date().toISOString();
  let attemptCount = 0;
  let lastAttemptAt = firstAttemptAt;
  let lastSystemError = 'Не вдалося отримати Reel.';
  let data: unknown = null;

  for (let i = 0; i < IMPORT_MAX_ATTEMPTS; i += 1) {
    attemptCount += 1;
    lastAttemptAt = new Date().toISOString();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.text();
        lastSystemError = `Не вдалося отримати Reel (${res.status}): ${body.slice(0, 500)}`;
        if (!isRetryableApifyFailure(res.status) || i === IMPORT_MAX_ATTEMPTS - 1) {
          throw new InstagramReferenceSystemError({
            message: lastSystemError,
            attemptCount,
            firstAttemptAt,
            lastAttemptAt: new Date().toISOString(),
            canonicalUrl: parsed.canonicalUrl,
            shortcode: parsed.shortcode,
          });
        }
        await sleep(toJitter(IMPORT_BACKOFF_MS[i] ?? 1_000));
        continue;
      }

      data = (await res.json()) as unknown;
      break;
    } catch (error) {
      if (error instanceof InstagramReferenceSystemError) {
        throw error;
      }
      lastSystemError = error instanceof Error ? error.message : String(error);
      const retryable = isRetryableFetchError(error);
      if (!retryable || i === IMPORT_MAX_ATTEMPTS - 1) {
        throw new InstagramReferenceSystemError({
          message: lastSystemError,
          attemptCount,
          firstAttemptAt,
          lastAttemptAt: new Date().toISOString(),
          canonicalUrl: parsed.canonicalUrl,
          shortcode: parsed.shortcode,
        });
      }
      await sleep(toJitter(IMPORT_BACKOFF_MS[i] ?? 1_000));
    }
  }

  if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object' || data[0] === null) {
    throw new InstagramReferenceNoVideoError(REFERENCE_NO_VIDEO_MESSAGE);
  }

  const mediaUrl = pickMediaUrl(data[0] as Record<string, unknown>);
  if (!mediaUrl) {
    throw new InstagramReferenceNoVideoError(REFERENCE_NO_VIDEO_MESSAGE);
  }

  return {
    normalizedUrl: parsed.canonicalUrl,
    mediaUrl,
    shortcode: parsed.shortcode,
    attemptCount,
    firstAttemptAt,
    lastAttemptAt: new Date().toISOString(),
  };
}
