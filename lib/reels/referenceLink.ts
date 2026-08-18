/**
 * What a reference link actually IS, so it can be shown rather than linked.
 *
 * «Референс» as a blue word means opening a tab, losing the plan, coming back.
 * A reel reference is almost always a video someone needs to watch next to the
 * shot list, so the ones that CAN be played inline are played inline.
 *
 * Embeds are used rather than resolving the media file: an embed needs no API
 * key, no scraping credits and no expiry, and it works for the client on the
 * shared page, who is not signed in to anything.
 *
 * Pure and import-free — the rules are exactly what the specs check.
 */

export type ReferenceKind = 'instagram' | 'tiktok' | 'youtube' | 'video' | 'image' | 'link';

export type Reference = {
  kind: ReferenceKind;
  /** The original link, always — every kind stays openable. */
  url: string;
  /** Where the player lives, for the kinds that have one. */
  embedUrl: string | null;
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|heic)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/** Instagram post and reel ids are the same shortcode space. */
const INSTAGRAM = /^https?:\/\/(?:www\.)?instagram\.com\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i;
const TIKTOK_VIDEO = /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/(\d+)/i;
const YOUTUBE_LONG = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_SHORT = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_SHORTS = /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i;

export function resolveReference(raw: string | null | undefined): Reference | null {
  const url = (raw ?? '').trim();
  if (!url) return null;
  // Only http(s): a `javascript:` or `data:` "reference" is not a reference.
  if (!/^https?:\/\//i.test(url)) return null;

  const instagram = url.match(INSTAGRAM);
  if (instagram) {
    return {
      kind: 'instagram',
      url,
      embedUrl: `https://www.instagram.com/reel/${instagram[1]}/embed`,
    };
  }

  const tiktok = url.match(TIKTOK_VIDEO);
  if (tiktok) {
    return { kind: 'tiktok', url, embedUrl: `https://www.tiktok.com/embed/v2/${tiktok[1]}` };
  }

  const youtube = url.match(YOUTUBE_LONG) ?? url.match(YOUTUBE_SHORT) ?? url.match(YOUTUBE_SHORTS);
  if (youtube) {
    return { kind: 'youtube', url, embedUrl: `https://www.youtube.com/embed/${youtube[1]}` };
  }

  // A file we can hand straight to <video> or <img> — including the images
  // pasted into a block, which live in our own storage.
  if (VIDEO_EXT.test(url)) return { kind: 'video', url, embedUrl: url };
  if (IMAGE_EXT.test(url)) return { kind: 'image', url, embedUrl: url };

  return { kind: 'link', url, embedUrl: null };
}

/** Can this be watched or seen without leaving the page? */
export function isPlayable(ref: Reference | null): boolean {
  return !!ref && ref.kind !== 'link';
}

export const REFERENCE_LABELS: Record<ReferenceKind, string> = {
  instagram: 'Reels',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  video: 'Відео',
  image: 'Зображення',
  link: 'Референс',
};
