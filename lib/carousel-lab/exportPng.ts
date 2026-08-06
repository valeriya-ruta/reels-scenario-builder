// Client-side PNG export. Rasterizes the EXACT same SVG the editor renders, with
// fonts embedded so the SVG is self-contained → export == editor, pixel-for-pixel.
'use client';

import type { LabSlide } from './types';
import { LAB_CANVAS_W, LAB_CANVAS_H } from './types';
import { buildSlideSvg } from './buildSlideSvg';
import { getMeasurer } from './measure';
import { ensureLabFontsLoaded, buildEmbeddedFontFaceCss } from './fonts';
import { resolveImageSrc } from './imageResolve';

async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Resolve every image slot to an inline data URI. Storage-backed images (cross
 * origin) are fetched and encoded so the exported SVG stays self-contained and
 * the rasterization canvas never taints.
 */
async function resolveImagesForExport(slide: LabSlide): Promise<Map<unknown, string>> {
  const map = new Map<unknown, string>();
  for (const img of slide.images) {
    if (img?.base64) {
      map.set(img, resolveImageSrc(img)!);
    } else if (img?.url) {
      const d = await fetchAsDataUri(img.url);
      if (d) map.set(img, d);
    }
  }
  return map;
}

export async function buildExportSvg(slide: LabSlide): Promise<string> {
  await ensureLabFontsLoaded();
  const embedFontCss = await buildEmbeddedFontFaceCss();
  const measure = getMeasurer();
  const imgMap = await resolveImagesForExport(slide);
  const imageSrc = (img: LabSlide['images'][number] | undefined) => (img ? imgMap.get(img) ?? null : null);
  return buildSlideSvg(slide, { measure, imageSrc, embedFontCss });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export async function slideToPngBlob(slide: LabSlide, scale = 1): Promise<Blob> {
  const svg = await buildExportSvg(slide);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = await loadImage(url);
  // Give the embedded @font-face a tick to be ready before the draw.
  try {
    await (document as Document).fonts.ready;
  } catch {
    /* ignore */
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(LAB_CANVAS_W * scale);
  canvas.height = Math.round(LAB_CANVAS_H * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), 'image/png'),
  );
  return blob;
}

export async function slideToPngDataUrl(slide: LabSlide, scale = 1): Promise<string> {
  const blob = await slideToPngBlob(slide, scale);
  return await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.readAsDataURL(blob);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadSlidePng(slide: LabSlide, filename: string) {
  const blob = await slideToPngBlob(slide);
  downloadBlob(blob, filename);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve((fr.result as string).split(',')[1] ?? '');
    fr.readAsDataURL(blob);
  });
}

/** Zip a set of already-rendered PNG blobs and download it. */
export async function downloadZipOfBlobs(blobs: (Blob | null)[], name: string) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  let n = 0;
  blobs.forEach((b, i) => {
    if (b) zip.file(`${String(i + 1).padStart(2, '0')}.png`, b);
    n++;
  });
  const out = await zip.generateAsync({ type: 'blob' });
  downloadBlob(out, `${name || 'carousel'}.zip`);
}

/** Share PNG blobs via the OS share sheet (Telegram / save image …). */
export async function sharePngBlobs(blobs: (Blob | null)[], name: string): Promise<boolean> {
  const files = blobs
    .map((b, i) => (b ? new File([b], `${name || 'slide'}-${i + 1}.png`, { type: 'image/png' }) : null))
    .filter(Boolean) as File[];
  if (!files.length) return false;
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  try {
    if (nav.canShare && !nav.canShare({ files })) return false;
    await nav.share({ files, title: name || 'carousel' } as ShareData);
    return true;
  } catch {
    return false;
  }
}

/** Export all slides as a zip of PNGs. */
export async function downloadProjectZip(slides: LabSlide[], name: string) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (let i = 0; i < slides.length; i++) {
    const blob = await slideToPngBlob(slides[i]);
    zip.file(`${String(i + 1).padStart(2, '0')}.png`, blob);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  downloadBlob(out, `${name || 'carousel'}.zip`);
}
