export type ParsedInstagramUrl =
  | { ok: true; shortcode: string; canonicalUrl: string; pathType: 'reel' | 'p' }
  | { ok: false; reason: 'empty' | 'not_instagram' | 'no_shortcode' };

const ZERO_WIDTH_CHARS_RE = /[\u200B-\u200D\uFEFF]/g;
const WRAPPING_QUOTES_RE = /^[`"'“”‘’]+|[`"'“”‘’]+$/g;
const SHORTCODE_RE = '[A-Za-z0-9_-]+';

function cleanupInput(input: string): string {
  return input.trim().replace(ZERO_WIDTH_CHARS_RE, '').replace(WRAPPING_QUOTES_RE, '').trim();
}

function parsePathnameForShortcode(pathname: string): { shortcode: string; pathType: 'reel' | 'p' } | null {
  const normalizedPath = pathname.replace(/\/+/g, '/');
  const patterns: Array<{ re: RegExp; pathType: 'reel' | 'p' }> = [
    { re: new RegExp(`^\\/(?:reel|reels)\\/(${SHORTCODE_RE})(?:\\/|$)`, 'i'), pathType: 'reel' },
    { re: new RegExp(`^\\/[^/]+\\/reel\\/(${SHORTCODE_RE})(?:\\/|$)`, 'i'), pathType: 'reel' },
    { re: new RegExp(`^\\/p\\/(${SHORTCODE_RE})(?:\\/|$)`, 'i'), pathType: 'p' },
  ];

  for (const { re, pathType } of patterns) {
    const match = normalizedPath.match(re);
    if (!match?.[1]) continue;
    return { shortcode: match[1], pathType };
  }
  return null;
}

export function parseInstagramReelUrl(input: string): ParsedInstagramUrl {
  const cleaned = cleanupInput(input);
  if (!cleaned) {
    return { ok: false, reason: 'empty' };
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  let hostname: string | null = null;
  let pathname = '';

  try {
    const parsed = new URL(withProtocol);
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname || '';
  } catch {
    const fallbackPathMatch = withProtocol.match(
      /^https?:\/\/(?:www\.)?instagram\.com(?::\d+)?(\/[^?#\s]*)?/i
    );
    if (!fallbackPathMatch) {
      return { ok: false, reason: 'not_instagram' };
    }
    hostname = 'instagram.com';
    pathname = fallbackPathMatch[1] ?? '';
  }

  if (hostname !== 'instagram.com' && hostname !== 'www.instagram.com') {
    return { ok: false, reason: 'not_instagram' };
  }

  const pathResult = parsePathnameForShortcode(pathname);
  if (!pathResult) {
    return { ok: false, reason: 'no_shortcode' };
  }

  const { shortcode, pathType } = pathResult;
  return {
    ok: true,
    shortcode,
    canonicalUrl: `https://www.instagram.com/reel/${shortcode}/`,
    pathType,
  };
}
