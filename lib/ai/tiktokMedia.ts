import { optionalServerEnv, requireServerEnv } from '@/lib/env';

const TIKTOK_EXACT_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
  'm.tiktok.com',
]);

function isTiktokHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (TIKTOK_EXACT_HOSTS.has(h)) return true;
  return h.endsWith('.tiktok.com');
}

function normalizeUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('Некоректне посилання. Встав посилання на публічне відео TikTok.');
  }

  if (!isTiktokHost(parsed.hostname)) {
    throw new Error('Потрібно посилання саме на публічне відео TikTok.');
  }

  return parsed;
}

function pickMediaUrl(item: Record<string, unknown>): string | null {
  const mediaUrls = item.mediaUrls;
  if (Array.isArray(mediaUrls)) {
    for (const entry of mediaUrls) {
      if (typeof entry === 'string' && entry.startsWith('http')) {
        return entry;
      }
    }
  }

  const candidates: unknown[] = [
    item.videoUrl,
    item.video_url,
    item.downloadAddr,
    item.playAddr,
  ];

  const videoMeta = item.videoMeta;
  if (videoMeta && typeof videoMeta === 'object' && videoMeta !== null) {
    const vm = videoMeta as Record<string, unknown>;
    candidates.push(vm.downloadAddr, vm.playAddr, vm.url);
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith('http')) {
      return candidate;
    }
  }

  return null;
}

export interface TiktokMediaResult {
  normalizedUrl: string;
  mediaUrl: string;
}

export async function resolveTiktokMediaUrl(postUrl: string): Promise<TiktokMediaResult> {
  const normalized = normalizeUrl(postUrl);
  const token = requireServerEnv('APIFY_TOKEN');
  const actorId = optionalServerEnv('APIFY_TIKTOK_ACTOR_ID') || 'clockworks/free-tiktok-scraper';

  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const payload = {
    postURLs: [normalized.toString()],
    shouldDownloadVideos: true,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
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
    throw new Error(`Не вдалося отримати TikTok (${res.status}): ${body}`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object' || data[0] === null) {
    throw new Error('Відео TikTok не знайдено або контент недоступний.');
  }

  const row = data[0] as Record<string, unknown>;
  if (typeof row.error === 'string' && row.error.trim()) {
    throw new Error(row.error);
  }

  const mediaUrl = pickMediaUrl(row);
  if (!mediaUrl) {
    throw new Error('Не вдалося знайти файл відео для цього TikTok. Спробуй інше посилання.');
  }

  return {
    normalizedUrl: normalized.toString(),
    mediaUrl,
  };
}
