import { optionalServerEnv, requireServerEnv } from '@/lib/env';

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

  return parsed;
}

function pickMediaUrl(item: Record<string, unknown>): string | null {
  const candidates = [
    item.videoUrl,
    item.video_url,
    item.videoHdUrl,
    item.video_versions,
    item.displayUrl,
    item.display_url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith('http')) {
      return candidate;
    }

    if (Array.isArray(candidate)) {
      const version = candidate.find(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          'url' in entry &&
          typeof (entry as { url?: unknown }).url === 'string'
      ) as { url: string } | undefined;
      if (version?.url) {
        return version.url;
      }
    }
  }

  return null;
}

export interface InstagramMediaResult {
  normalizedUrl: string;
  mediaUrl: string;
}

export async function resolveInstagramMediaUrl(reelUrl: string): Promise<InstagramMediaResult> {
  const normalized = normalizeUrl(reelUrl);
  const token = requireServerEnv('APIFY_TOKEN');
  const actorId = optionalServerEnv('APIFY_INSTAGRAM_ACTOR_ID') || 'apify/instagram-scraper';

  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const payload = {
    directUrls: [normalized.toString()],
    resultsType: 'details',
    resultsLimit: 1,
    addParentData: false,
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
