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

/**
 * Threads post paths: `/@handle/post/CODE` (the shared form) and `/t/CODE` (the
 * short form). A bare `/@handle` is a profile, which is NOT a repurposable post.
 */
function parseThreadsPath(pathname: string): { canonicalPath: string } | null {
  const path = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  const full = path.match(/^\/(@[^/]+)\/post\/([A-Za-z0-9_-]+)/);
  if (full) return { canonicalPath: `/${full[1]}/post/${full[2]}` };
  const short = path.match(/^\/t\/([A-Za-z0-9_-]+)/);
  if (short) return { canonicalPath: `/t/${short[1]}` };
  return null;
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
