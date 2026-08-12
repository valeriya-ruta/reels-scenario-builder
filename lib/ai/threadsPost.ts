import 'server-only';

import { optionalServerEnv, requireServerEnv } from '@/lib/env';
import { isAbsoluteHttpUrlString } from '@/lib/isAbsoluteHttpUrl';
import { extractThreadsPostUrl, isThreadsShortLink } from '@/lib/repurpose/sourceUrl';

/**
 * Threads post → text, via Apify (the SAME token/pattern the Instagram and
 * TikTok resolvers already use — no new key, no new provider).
 *
 * Actor: `logical_scrapers/threads-post-scraper`. Chosen because it takes POST
 * URLs directly (`startUrls`) rather than a keyword/username search, which is
 * what repurposing needs: one pasted link, one post back. Its dataset item is
 * `{ thread: {...}, replies: [...] }`, where `thread` is the original post and
 * `replies` includes the author's own continuation posts — a real Threads
 * "thread" is a chain, so those are stitched back on.
 *
 * Override with APIFY_THREADS_ACTOR_ID if a better actor shows up; anything
 * returning the same-ish item shape works, since the readers below are tolerant.
 */

export const DEFAULT_THREADS_POST_ACTOR = 'logical_scrapers/threads-post-scraper';

const IMPORT_MAX_ATTEMPTS = 3;
const IMPORT_TIMEOUT_MS = 60_000;
const IMPORT_BACKOFF_MS = [1_000, 3_000, 7_000] as const;

const THREADS_NOT_FOUND_MESSAGE =
  'Не вдалося прочитати цей пост у Threads. Можливо, він видалений, акаунт закритий, або посилання неповне.';
const THREADS_EMPTY_MESSAGE =
  'У цьому пості немає тексту, який можна переробити. Спробуй пост із текстом.';
const THREADS_SHARE_UNRESOLVED_MESSAGE =
  'Не вдалося розгорнути це коротке посилання Threads. Відкрий пост і скопіюй повне посилання — те, що містить @нік і /post/.';

/** Following a share link is one hop; it must not eat the request budget. */
const SHARE_RESOLVE_TIMEOUT_MS = 15_000;
/** Meta serves short links differently to obvious bots. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class ThreadsPostNotFoundError extends Error {}
export class ThreadsPostEmptyError extends Error {}
export class ThreadsPostSystemError extends Error {}

export interface ThreadsPostResult {
  /** Post text — the original plus the author's own continuation posts. */
  text: string;
  /** @handle of the author, when the actor returned one. */
  authorHandle: string | null;
  /** Direct video URL when the post is a video post and carries no usable text. */
  videoUrl: string | null;
  normalizedUrl: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toJitter(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * 250);
}

function isRetryableStatus(status: number): boolean {
  if (status === 429 || status >= 500) return true;
  return !(status === 400 || status === 401 || status === 403 || status === 404);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

type ThreadRow = Record<string, unknown>;

/** The actor nests the post under `thread`; tolerate a flat row too. */
function pickThread(item: unknown): ThreadRow | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as ThreadRow;
  const nested = row.thread ?? row.post;
  if (nested && typeof nested === 'object') return nested as ThreadRow;
  if (typeof row.text === 'string') return row;
  return null;
}

function pickReplies(item: unknown): ThreadRow[] {
  if (!item || typeof item !== 'object') return [];
  const replies = (item as ThreadRow).replies;
  if (!Array.isArray(replies)) return [];
  return replies.filter((r): r is ThreadRow => Boolean(r) && typeof r === 'object');
}

function pickVideoUrl(row: ThreadRow): string | null {
  const videos = row.videos;
  if (Array.isArray(videos)) {
    for (const entry of videos) {
      if (typeof entry === 'string' && isAbsoluteHttpUrlString(entry)) return entry.trim();
      if (entry && typeof entry === 'object') {
        const url = (entry as { url?: unknown }).url;
        if (typeof url === 'string' && isAbsoluteHttpUrlString(url)) return url.trim();
      }
    }
  }
  for (const key of ['videoUrl', 'video_url']) {
    const candidate = row[key];
    if (typeof candidate === 'string' && isAbsoluteHttpUrlString(candidate)) return candidate.trim();
  }
  return null;
}

/**
 * The author's own follow-up posts, in order — on Threads that IS the post. A
 * reply from anyone else is a comment and must never end up in the source text.
 */
function selfContinuation(item: unknown, authorHandle: string): string[] {
  if (!authorHandle) return [];
  const rows = pickReplies(item).filter((r) => str(r.username).toLowerCase() === authorHandle.toLowerCase());
  rows.sort((a, b) => Number(a.published_on ?? 0) - Number(b.published_on ?? 0));
  return rows.map((r) => str(r.text)).filter(Boolean);
}

/**
 * Turn a short Threads link into the post URL the scraper can actually read.
 *
 * `/share/CODE` is what the Threads Share button produces, so it is the link
 * people paste — and the scraper returns nothing for it (verified: zero dataset
 * items for a share URL, a full post for the canonical one it redirects to).
 * So follow the hop ourselves before spending an actor run.
 *
 * Two ways to read the answer, because Meta may serve either: the HTTP redirect
 * chain (`res.url`), or an interstitial page whose `<link rel="canonical">` /
 * `og:url` still names the post. A full post URL passes straight through
 * untouched, so this costs nothing in the normal case.
 */
export async function resolveThreadsPostUrl(postUrl: string): Promise<string> {
  if (!isThreadsShortLink(postUrl)) return postUrl;

  try {
    const res = await fetch(postUrl, {
      redirect: 'follow',
      headers: { 'user-agent': BROWSER_UA, 'accept-language': 'uk,en;q=0.8' },
      signal: AbortSignal.timeout(SHARE_RESOLVE_TIMEOUT_MS),
    });

    const fromRedirect = extractThreadsPostUrl(res.url);
    if (fromRedirect) return fromRedirect;

    const body = await res.text();
    const canonical = body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1];
    const ogUrl = body.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
    for (const candidate of [canonical, ogUrl, body]) {
      const found = candidate ? extractThreadsPostUrl(candidate) : null;
      if (found) return found;
    }
  } catch (error) {
    console.error('[threads] share link resolve failed', error);
  }

  throw new ThreadsPostNotFoundError(THREADS_SHARE_UNRESOLVED_MESSAGE);
}

async function runActor(postUrl: string): Promise<unknown> {
  const token = requireServerEnv('APIFY_TOKEN');
  const actorId = optionalServerEnv('APIFY_THREADS_ACTOR_ID') || DEFAULT_THREADS_POST_ACTOR;
  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  /** Input schema: `logical_scrapers/threads-post-scraper` — post URLs in `startUrls`. */
  const payload = {
    startUrls: [{ url: postUrl }],
    proxyConfiguration: { useApifyProxy: true },
  };

  let lastError = 'Не вдалося отримати пост із Threads.';

  for (let attempt = 0; attempt < IMPORT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      });

      if (res.ok) return (await res.json()) as unknown;

      const body = await res.text();
      lastError = `Threads scrape failed (${res.status}): ${body.slice(0, 300)}`;
      if (!isRetryableStatus(res.status) || attempt === IMPORT_MAX_ATTEMPTS - 1) {
        throw new ThreadsPostSystemError(lastError);
      }
    } catch (error) {
      if (error instanceof ThreadsPostSystemError) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === IMPORT_MAX_ATTEMPTS - 1) throw new ThreadsPostSystemError(lastError);
    }
    await sleep(toJitter(IMPORT_BACKOFF_MS[attempt] ?? 1_000));
  }

  throw new ThreadsPostSystemError(lastError);
}

/**
 * Fetch one public Threads post. Throws `ThreadsPostEmptyError` only when there
 * is neither text nor a video to fall back on — a video-only post is still
 * repurposable (the caller transcribes it), so it is not an error here.
 */
export async function fetchThreadsPost(postUrl: string): Promise<ThreadsPostResult> {
  const resolvedUrl = await resolveThreadsPostUrl(postUrl);
  const data = await runActor(resolvedUrl);

  const items = Array.isArray(data) ? data : [data];
  const item = items.find((entry) => pickThread(entry) !== null);
  const thread = item ? pickThread(item) : null;
  if (!thread) {
    throw new ThreadsPostNotFoundError(THREADS_NOT_FOUND_MESSAGE);
  }

  const authorHandle = str(thread.username);
  const parts = [str(thread.text), ...selfContinuation(item, authorHandle)].filter(Boolean);
  const text = parts.join('\n\n');
  const videoUrl = pickVideoUrl(thread);

  if (!text && !videoUrl) {
    throw new ThreadsPostEmptyError(THREADS_EMPTY_MESSAGE);
  }

  return {
    text,
    authorHandle: authorHandle ? `@${authorHandle}` : null,
    videoUrl,
    // Never hand back the short link: what gets stored with the generated piece
    // should be the post itself.
    normalizedUrl: str(thread.url) || resolvedUrl,
  };
}
