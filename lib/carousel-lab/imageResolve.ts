import type { LabImage } from './types';

/** Sniff a base64 image's MIME from its magic bytes (jpeg/png/webp). */
function sniffMime(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

/** Resolve an image slot to an <image href> value: url, then inline base64. */
export function resolveImageSrc(img: LabImage | undefined): string | null {
  if (!img) return null;
  if (img.url && img.url.trim()) return img.url.trim();
  if (img.base64 && img.base64.trim()) return `data:${sniffMime(img.base64)};base64,${img.base64}`;
  return null;
}
