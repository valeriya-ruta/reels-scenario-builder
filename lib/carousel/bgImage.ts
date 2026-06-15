/**
 * Background-photo handling for the carousel editor.
 *
 * Root cause of the autosave data-loss + "Не вдалося згенерувати слайди" export
 * failure (tasks 86d3btm0w / 86d3btkr4): uploaded background photos were stored
 * as raw base64 inside the slides JSONB. A single full-res photo is several MB,
 * so the autosave / pre-export POST body exceeded Vercel's ~4.5 MB request limit
 * and came back HTTP 413 — the save silently failed (lost edits) and the export
 * aborted. Compressing the photo on upload keeps the persisted payload small so
 * the save always fits.
 */

/** Strip a `data:<mime>;base64,` prefix, returning just the base64 bytes. */
export function stripDataUrlBase64(data: string): string {
  const m = data.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : data;
}

/**
 * Detect the image MIME from base64 magic bytes. Lets a stored photo render with
 * the correct `data:` prefix regardless of whether it was an older PNG upload or
 * a newly compressed JPEG — no need to track the format separately.
 */
export function base64ImageMime(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  return 'image/png';
}

/** Build a renderable data URL from stored base64 (auto-detects the MIME). */
export function bgPhotoDataUrl(b64: string): string {
  return `data:${base64ImageMime(b64)};base64,${b64}`;
}

/**
 * Downscale + JPEG-compress an uploaded image in the browser, returning base64
 * bytes (no data-URL prefix) ready to store in the slide. `maxDim` (1620px ≈
 * 1.5× the 1080×1350 canvas) keeps enough resolution to cover the slide with
 * zoom headroom while cutting a multi-MB upload to a few hundred KB.
 */
export async function compressImageFileToBase64(
  file: File,
  { maxDim = 1620, quality = 0.82 }: { maxDim?: number; quality?: number } = {},
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Не вдалося прочитати файл'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не вдалося декодувати зображення'));
    image.src = dataUrl;
  });

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) {
    // Decode gave no dimensions — fall back to the original bytes rather than fail.
    return stripDataUrlBase64(dataUrl);
  }

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return stripDataUrlBase64(dataUrl);
  ctx.drawImage(img, 0, 0, outW, outH);

  const out = canvas.toDataURL('image/jpeg', quality);
  const compressed = stripDataUrlBase64(out);
  // Guard against pathological cases where JPEG re-encode is larger than source
  // (tiny / already-optimised images): keep whichever is smaller.
  const original = stripDataUrlBase64(dataUrl);
  return compressed.length < original.length ? compressed : original;
}

/**
 * Approximate the serialized byte size of an arbitrary value (for the autosave
 * payload guard). Uses Blob when available, falling back to a char-count
 * estimate (base64 is ASCII, so 1 char ≈ 1 byte).
 */
export function approxJsonBytes(value: unknown): number {
  const json = JSON.stringify(value);
  if (typeof Blob !== 'undefined') return new Blob([json]).size;
  return json.length;
}

/**
 * Hard ceiling for a carousel save payload. Vercel rejects request bodies over
 * ~4.5 MB with HTTP 413; we refuse a little earlier so the editor can surface a
 * clear message instead of silently losing the edit.
 */
export const MAX_SAVE_PAYLOAD_BYTES = 4_000_000;
