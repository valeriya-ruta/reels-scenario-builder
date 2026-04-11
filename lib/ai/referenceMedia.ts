import { resolveInstagramMediaUrl } from '@/lib/ai/instagramMedia';
import { resolveTiktokMediaUrl } from '@/lib/ai/tiktokMedia';

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

function isTiktokHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === 'tiktok.com' ||
    h === 'www.tiktok.com' ||
    h === 'vm.tiktok.com' ||
    h === 'vt.tiktok.com' ||
    h === 'm.tiktok.com'
  ) {
    return true;
  }
  return h.endsWith('.tiktok.com');
}

export interface ResolvedReferenceMedia {
  normalizedUrl: string;
  mediaUrl: string;
}

/**
 * Resolves a direct media URL for transcription from an Instagram Reel or TikTok post URL.
 */
export async function resolveReferenceMediaUrl(pageUrl: string): Promise<ResolvedReferenceMedia> {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl.trim());
  } catch {
    throw new Error(
      'Некоректне посилання. Встав посилання на публічний Instagram Reel або відео TikTok.'
    );
  }

  const host = parsed.hostname.toLowerCase();

  if (INSTAGRAM_HOSTS.has(host)) {
    return resolveInstagramMediaUrl(pageUrl);
  }

  if (isTiktokHost(host)) {
    return resolveTiktokMediaUrl(pageUrl);
  }

  throw new Error('Підтримуються лише посилання Instagram Reel або TikTok.');
}
