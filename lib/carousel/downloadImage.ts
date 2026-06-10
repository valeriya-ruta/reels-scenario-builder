// Robust client-side image download.
//
// Every download builds a FRESH Blob + object URL on a FRESH detached <a>, clicks
// it, then removes the node and revokes the URL. Reusing any of these across calls
// is what made the 2nd…Nth export silently no-op until an app restart (a revoked /
// reused object URL points at nothing, so the browser "succeeds" with no file).
// Recreating per call makes the Nth download behave exactly like the 1st.

/**
 * Triggers a real file download for a base64 PNG. Returns true only if the click
 * was actually dispatched, so callers show "saved" feedback on a real attempt and
 * never a toast that masks a no-op.
 */
export function downloadPngFromBase64(base64: string, filename: string): boolean {
  if (typeof document === 'undefined' || !base64) return false;
  return triggerBlobDownload(base64ToBlob(base64, 'image/png'), filename);
}

function base64ToBlob(base64: string, mime: string): Blob {
  const byteChars = atob(base64);
  const len = byteChars.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function triggerBlobDownload(blob: Blob, filename: string): boolean {
  if (typeof document === 'undefined') return false;
  // Fresh URL + fresh <a> for every single download — no shared/one-shot resource.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Tear the node down on the next frame and revoke the URL once the browser has
  // had time to start the save, so repeated exports never accumulate stale
  // URLs/nodes (the leak behind the "works once" bug).
  requestAnimationFrame(() => {
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
  });
  return true;
}

/**
 * Save every slide PNG to the device, one after another, as individual images —
 * NOT a zip. On mobile a zip can't land in the camera roll and is painful to
 * unpack; sequential per-image saves drop straight into the gallery in order.
 *
 * Mobile WebViews throttle rapid programmatic downloads (only the first lands if
 * they're fired back-to-back), so each save is spaced by `delayMs`. `onProgress`
 * fires after each delivered slide (1-based) so callers can surface live feedback.
 * Returns the number of slides actually delivered (0 = nothing to download).
 */
export async function saveSlidesSequentially(
  slides: (string | null)[],
  {
    filenamePrefix = 'ruta-carousel',
    delayMs = 700,
    onProgress,
  }: {
    filenamePrefix?: string;
    delayMs?: number;
    onProgress?: (delivered: number, total: number) => void;
  } = {},
): Promise<number> {
  if (typeof document === 'undefined') return 0;
  const ready = slides
    .map((b64, i) => ({ b64, i }))
    .filter((s): s is { b64: string; i: number } => Boolean(s.b64));
  const total = ready.length;
  let delivered = 0;
  for (let k = 0; k < ready.length; k++) {
    const { b64, i } = ready[k];
    const ok = downloadPngFromBase64(b64, `${filenamePrefix}-${i + 1}.png`);
    if (ok) {
      delivered += 1;
      onProgress?.(delivered, total);
    }
    // Space out all but the last save so WebViews don't drop the queued downloads.
    if (k < ready.length - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }
  return delivered;
}
