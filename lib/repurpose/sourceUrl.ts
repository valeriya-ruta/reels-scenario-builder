import { parseInstagramReelUrl } from '@/lib/instagramUrl';
import type { RepurposeSourceKind } from '@/lib/repurpose/types';

/**
 * "What did the user just paste?" — pure, so the overlay can label the link the
 * moment it lands in the box (no server round-trip, no spinner for something we
 * can read off the URL itself).
 *
 * Deliberately permissive about the things people actually paste: missing
 * protocol, share-sheet tracking params, wrapping quotes, threads.net vs the
 * newer threads.com host. Deliberately strict about the shape that matters —
 * a POST url, not a profile — because a profile link silently scraping the
 * wrong thing is worse than an early "це не схоже на пост".
 */

export type DetectedSource =
  | { ok: true; kind: RepurposeSourceKind; canonicalUrl: string }
  | { ok: false; reason: 'empty' | 'unsupported' };

const ZERO_WIDTH_CHARS_RE = /[\u200B-\u200D\uFEFF]/g;
const WRAPPING_QUOTES_RE = /^[`"'“”‘’]+|[`"'“”‘’]+$/g;

const THREADS_HOSTS = new Set([
  'threads.net',
  'www.threads.net',
  'threads.com',
  'www.threads.com',
]);

const TIKTOK_EXACT_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
  'm.tiktok.com',
]);

export function cleanupPastedUrl(input: string): string {
  return input.trim().replace(ZERO_WIDTH_CHARS_RE, '').replace(WRAPPING_QUOTES_RE, '').trim();
}

function withProtocol(value: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

function isTiktokHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return TIKTOK_EXACT_HOSTS.has(h) || h.endsWith('.tiktok.com');
}

/** A full Threads post path — the only form the scraper can read directly. */
const THREADS_POST_PATH_RE = /\/(@[A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)/;
/** Short forms that only REDIRECT to a post: `/share/CODE` and `/t/CODE`. */
const THREADS_SHORT_PATH_RE = /^\/(?:share|t)\/([A-Za-z0-9_-]+)/;

/**
 * Threads post paths.
 *
 * Three shapes reach us, and the difference matters downstream: `/@handle/post/CODE`
 * is what the scraper can read as-is, while `/share/CODE` (what the app's own
 * Share button produces, so it is the one people actually paste) and the older
 * `/t/CODE` are short links that only redirect to it — those are resolved
 * server-side before scraping. A bare `/@handle` is a profile, not a post.
 */
function parseThreadsPath(pathname: string): { canonicalPath: string } | null {
  const path = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  const full = path.match(THREADS_POST_PATH_RE);
  if (full) return { canonicalPath: `/${full[1]}/post/${full[2]}` };
  const short = path.match(THREADS_SHORT_PATH_RE);
  if (short) return { canonicalPath: path };
  return null;
}

/** True when this Threads URL still has to be followed to reach the real post. */
export function isThreadsShortLink(url: string): boolean {
  try {
    return THREADS_SHORT_PATH_RE.test(new URL(withProtocol(cleanupPastedUrl(url))).pathname);
  } catch {
    return false;
  }
}

/**
 * Pull the canonical `https://www.threads.com/@handle/post/CODE` out of anything
 * that contains one — a redirect target, a `<link rel="canonical">`, an `og:url`.
 * Used to turn a followed share link back into a URL the scraper accepts.
 */
export function extractThreadsPostUrl(text: string): string | null {
  const match = text.match(THREADS_POST_PATH_RE);
  if (!match) return null;
  return `https://www.threads.com/${match[1]}/post/${match[2]}`;
}

/** TikTok post paths: `/@handle/video/ID`, `/v/ID`, or a vm/vt short link. */
function isTiktokPostUrl(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  // Short links carry no post path — the redirect resolves it, so accept them.
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    return parsed.pathname.replace(/\/+/g, '/').length > 1;
  }
  const path = parsed.pathname.replace(/\/+/g, '/');
  return /^\/@[^/]+\/(video|photo)\/\d+/.test(path) || /^\/v\/\d+/.test(path);
}

export function detectRepurposeSource(input: string): DetectedSource {
  const cleaned = cleanupPastedUrl(input);
  if (!cleaned) return { ok: false, reason: 'empty' };

  // Instagram first: its parser already knows every reel/post URL shape the app
  // supports, and it is the same one the transcription pipeline will re-run.
  const instagram = parseInstagramReelUrl(cleaned);
  if (instagram.ok) {
    return { ok: true, kind: 'reel', canonicalUrl: instagram.canonicalUrl };
  }

  let parsed: URL;
  try {
    parsed = new URL(withProtocol(cleaned));
  } catch {
    return { ok: false, reason: 'unsupported' };
  }

  const host = parsed.hostname.toLowerCase();

  if (THREADS_HOSTS.has(host)) {
    const threads = parseThreadsPath(parsed.pathname);
    if (!threads) return { ok: false, reason: 'unsupported' };
    // threads.net now serves from threads.com; canonicalize so the scraper always
    // gets the host it expects, and drop share-sheet query junk.
    return { ok: true, kind: 'threads', canonicalUrl: `https://www.threads.com${threads.canonicalPath}` };
  }

  if (isTiktokHost(host)) {
    if (!isTiktokPostUrl(parsed)) return { ok: false, reason: 'unsupported' };
    return { ok: true, kind: 'tiktok', canonicalUrl: `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}` };
  }

  return { ok: false, reason: 'unsupported' };
}

/** The one message the user sees for anything we can't repurpose. */
export const UNSUPPORTED_SOURCE_MESSAGE =
  'Це не схоже на пост 🤔 Встав посилання на Instagram Reel, пост у Threads або відео TikTok — прямо з кнопки «Поділитися».';
