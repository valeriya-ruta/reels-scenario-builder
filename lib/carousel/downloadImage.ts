// Robust client-side image download.
//
// The previous implementation built a data: URL on a detached <a> and clicked
// it, then showed a "saved" toast regardless of whether anything was delivered.
// After repeated exports, browsers (Chrome especially) silently stopped
// delivering those downloads until an app restart. Using a Blob + object URL
// that is appended to the DOM, clicked, then removed and revoked makes the Nth
// download behave like the 1st and prevents blob-URL / DOM-node leaks.

import JSZip from 'jszip';

function base64ToBlob(base64: string, mime: string): Blob {
  const byteChars = atob(base64);
  const len = byteChars.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Triggers a real file download for a base64 PNG. Returns true if the click was
 * dispatched (so callers can show "downloaded" feedback only on a real attempt,
 * never a "saved" toast that masks a no-op).
 */
export function downloadPngFromBase64(base64: string, filename: string): boolean {
  if (typeof document === 'undefined' || !base64) return false;
  const url = URL.createObjectURL(base64ToBlob(base64, 'image/png'));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Remove the node on the next frame and revoke the object URL once the browser
  // has had time to begin the download — clean per-download teardown so repeated
  // exports never accumulate stale URLs/nodes.
  requestAnimationFrame(() => {
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
  });
  return true;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
  });
}

/**
 * Bundle every slide PNG into ONE .zip and download that single file.
 *
 * "Download all" used to fire N separate programmatic downloads from a single
 * tap. Mobile browsers (and Safari) suppress every download after the first, so
 * only slide 1 arrived (86d39e144). A single ZIP is one download → reliable
 * cross-browser. Returns the number of slides bundled (0 = nothing to download).
 */
export async function downloadSlidesZip(
  slides: (string | null)[],
  zipName = 'ruta-carousel.zip',
): Promise<number> {
  if (typeof document === 'undefined') return 0;
  const zip = new JSZip();
  let count = 0;
  for (let i = 0; i < slides.length; i++) {
    const b64 = slides[i];
    if (!b64) continue;
    zip.file(`ruta-carousel-${i + 1}.png`, b64, { base64: true });
    count += 1;
  }
  if (count === 0) return 0;
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(blob, zipName);
  return count;
}
