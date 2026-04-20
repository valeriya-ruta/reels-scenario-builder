import { optionalServerEnv, requireServerEnv } from '@/lib/env';
import { isAbsoluteHttpUrlString } from '@/lib/isAbsoluteHttpUrl';
import { DEFAULT_INSTAGRAM_REEL_SCRAPER_ACTOR } from '@/lib/ai/competitorReelsApify';

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

function normalizeUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('Некоректне посилання. Встав посилання на Instagram Reel.');
  }

  if (!INSTAGRAM_HOSTS.has(parsed.hostname)) {
    throw new Error('Потрібно посилання саме на публічний Instagram Reel.');
  }

  const reelPathPattern = /^\/reels?\//;
  if (!reelPathPattern.test(parsed.pathname)) {
    throw new Error('Підтримуються лише посилання формату Instagram Reel.');
  }

  // Drop tracking params/fragments (e.g. `igsh`) to keep scraper input stable.
  parsed.search = '';
  parsed.hash = '';

  return parsed;
}

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
}

export async function resolveInstagramMediaUrl(reelUrl: string): Promise<InstagramMediaResult> {
  const normalized = normalizeUrl(reelUrl);
  const token = requireServerEnv('APIFY_TOKEN');
  const actorId =
    optionalServerEnv('APIFY_INSTAGRAM_ACTOR_ID') ||
    DEFAULT_INSTAGRAM_REEL_SCRAPER_ACTOR;

  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  /** Input schema: `apify/instagram-reel-scraper` — reel or profile URL in `username` array */
  const payload = {
    username: [normalized.toString()],
    resultsLimit: 1,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Не вдалося отримати Reel (${res.status}): ${body}`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object' || data[0] === null) {
    throw new Error('Reel не знайдено або контент недоступний.');
  }

  const mediaUrl = pickMediaUrl(data[0] as Record<string, unknown>);
  if (!mediaUrl) {
    throw new Error('Не вдалося знайти відео URL для цього Reel.');
  }

  return {
    normalizedUrl: normalized.toString(),
    mediaUrl,
  };
}
