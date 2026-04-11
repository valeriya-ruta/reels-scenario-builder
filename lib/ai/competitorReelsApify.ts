import { optionalServerEnv, requireServerEnv } from '@/lib/env';
import type { RawReelInput } from '@/lib/competitorScoring';

const APIFY = 'https://api.apify.com/v2';

export const DEFAULT_INSTAGRAM_REEL_SCRAPER_ACTOR = 'apify/instagram-reel-scraper';
export const DEFAULT_INSTAGRAM_PROFILE_SCRAPER_ACTOR = 'apify/instagram-profile-scraper';

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return 0;
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/)[0]?.trim() ?? '';
  return line || text.slice(0, 200);
}

function permalinkFromItem(item: Record<string, unknown>, shortCode: string): string {
  const candidates = [item.url, item.permalink, item.link];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return `https://www.instagram.com/reel/${shortCode}/`;
}

function videoUrlFromItem(item: Record<string, unknown>): string {
  const candidates = [item.videoUrl, item.video_url, item.video_url_hd];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

function templateFromHook(hook: string): { pattern: string; lines: string[] } {
  const compact = hook.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return {
      pattern: 'хук → контраст → користь',
      lines: ['[контекст]', '[контраст/проблема]', '[рішення + CTA]'],
    };
  }
  return {
    pattern: 'особиста зміна → провокація → рішення',
    lines: ['[для кого]', '[болить/провокація]', '[що робити крок 1-2-3]'],
  };
}

export function captionToHook(item: Record<string, unknown>): string {
  const c = item.caption;
  if (typeof c === 'string') return firstLine(c);
  if (c && typeof c === 'object' && c !== null && 'text' in c) {
    const t = (c as { text?: unknown }).text;
    if (typeof t === 'string') return firstLine(t);
  }
  const alt = item.title ?? item.text;
  if (typeof alt === 'string') return firstLine(alt);
  return '';
}

export function buildCompetitorActorInput(handle: string): Record<string, unknown> {
  const u = handle.replace(/^@/, '').trim().toLowerCase();
  const template = optionalServerEnv('APIFY_COMPETITOR_INPUT_JSON');
  if (template) {
    const json = template.replace(/__HANDLE__/g, u);
    try {
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      throw new Error('APIFY_COMPETITOR_INPUT_JSON не є валідним JSON.');
    }
  }
  /** `apify/instagram-reel-scraper`: profile URL or username per item */
  return {
    username: [`https://www.instagram.com/${u}/`],
    resultsLimit: 50,
  };
}

export interface ApifyRunInfo {
  status: string;
  defaultDatasetId: string | null;
}

export async function startCompetitorActorRun(
  input: Record<string, unknown>
): Promise<string> {
  const token = requireServerEnv('APIFY_TOKEN');
  const actorId =
    optionalServerEnv('APIFY_INSTAGRAM_ACTOR_ID') ||
    DEFAULT_INSTAGRAM_REEL_SCRAPER_ACTOR;

  const url = `${APIFY}/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify run failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as { data?: { id?: string } };
  const runId = json.data?.id;
  if (!runId) {
    throw new Error('Apify не повернув id запуску.');
  }
  return runId;
}

/**
 * Sync scrape for profile metadata (followers, canonical username).
 * Uses `apify/instagram-profile-scraper` by default.
 */
export async function fetchInstagramProfileSync(handle: string): Promise<{
  username: string;
  followersCount: number;
} | null> {
  const u = handle.replace(/^@/, '').trim().toLowerCase();
  if (!u) return null;

  const token = requireServerEnv('APIFY_TOKEN');
  const actorId =
    optionalServerEnv('APIFY_INSTAGRAM_PROFILE_ACTOR_ID') ??
    DEFAULT_INSTAGRAM_PROFILE_SCRAPER_ACTOR;

  const endpoint = `${APIFY}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usernames: [u] }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Instagram profile scraper failed', res.status, body.slice(0, 400));
    return null;
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object' || data[0] === null) {
    return null;
  }

  const row = data[0] as Record<string, unknown>;
  const username = String(row.username ?? u).replace(/^@/, '');
  const followersCount = Math.round(num(row.followersCount));

  return {
    username,
    followersCount: Math.max(0, followersCount),
  };
}

export async function getActorRun(runId: string): Promise<ApifyRunInfo> {
  const token = requireServerEnv('APIFY_TOKEN');
  const url = `${APIFY}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify run poll failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    data?: { status?: string; defaultDatasetId?: string };
  };
  const d = json.data;
  return {
    status: (d?.status ?? 'UNKNOWN').toUpperCase(),
    defaultDatasetId: d?.defaultDatasetId ?? null,
  };
}

export async function fetchDatasetItems(datasetId: string): Promise<unknown[]> {
  const token = requireServerEnv('APIFY_TOKEN');
  const url = `${APIFY}/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}&format=json&clean=1`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify dataset (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : [];
}

function shortCodeFromItem(item: Record<string, unknown>, index: number): string {
  const s = item.shortCode ?? item.shortcode;
  if (typeof s === 'string' && s.trim()) return s.trim();
  const id = item.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return `reel-${index}`;
}

function savesFromItem(item: Record<string, unknown>): number {
  return num(
    item.savedCount ??
      item.savesCount ??
      item.videoSavedCount ??
      item.saveCount ??
      item.collectedCount
  );
}

/**
 * Parses Apify dataset rows into scoring input. Skips obvious non-video rows when possible.
 */
export function apifyItemsToRawReels(items: unknown[]): RawReelInput[] {
  const out: RawReelInput[] = [];
  items.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const item = raw as Record<string, unknown>;

    const type = String(item.type ?? '').toLowerCase();
    const product = String(item.productType ?? '').toLowerCase();
    const hasVideo =
      typeof item.videoUrl === 'string' ||
      typeof item.video_url === 'string' ||
      num(item.videoViewCount) > 0 ||
      num(item.playCount) > 0;

    if (type === 'image' && !hasVideo) return;
    if (product === 'feed' && !hasVideo) return;

    const views = num(
      item.videoViewCount ?? item.playCount ?? item.videoPlayCount ?? item.viewCount
    );

    const shortCode = shortCodeFromItem(item, index);
    const template = templateFromHook(captionToHook(item));
    const reel: RawReelInput = {
      shortCode,
      url: permalinkFromItem(item, shortCode),
      videoUrl: videoUrlFromItem(item),
      hook: captionToHook(item) || 'Без підпису',
      templatePattern: template.pattern,
      templateLines: template.lines,
      videoViewCount: views,
      saves: savesFromItem(item),
      likes: num(item.likesCount ?? item.likes ?? item.likeCount),
      comments: num(item.commentsCount ?? item.commentCount ?? item.comments),
    };
    out.push(reel);
  });
  return out;
}

export function followerCountFromFirstItem(items: unknown[]): number {
  const first = items[0];
  if (!first || typeof first !== 'object') return 0;
  const item = first as Record<string, unknown>;
  let fromOwner = 0;
  const owner = item.owner;
  if (owner && typeof owner === 'object') {
    fromOwner = num((owner as Record<string, unknown>).followersCount);
  }
  return Math.round(num(item.ownerFollowersCount ?? item.followersCount) || fromOwner);
}
