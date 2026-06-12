// Client-side slide-image saving for the carousel export.
//
// Goals (mobile-first — web.ruta.media is used on a phone):
//  - Save each slide as its OWN image file straight to the gallery / camera
//    roll. Never a ZIP — unpacking an archive on a phone is the exact pain Ruta
//    asked us to remove.
//  - Bulk "save all" and single-slide save are two separate, independently
//    reliable actions.
//  - CRUCIALLY: every save recreates its own resources (Blob, object URL,
//    <a> element, File) and tears them down afterwards. The previous build
//    created an object URL / anchor once, revoked it, then reused the dead
//    reference — so the 1st export delivered a file and every later one silently
//    no-op'd (success toast, no file) until the app was restarted. Recreating
//    per call makes the Nth save behave exactly like the 1st.

export type SaveOutcome = 'shared' | 'downloaded' | 'failed';

export type SaveResult = { count: number; outcome: SaveOutcome };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// Fresh Blob built from the base64 PNG on every call — no shared/cached buffer.
function base64ToBlob(base64: string, mime = 'image/png'): Blob {
  const byteChars = atob(base64);
  const len = byteChars.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function base64ToFile(base64: string, filename: string, mime = 'image/png'): File {
  return new File([base64ToBlob(base64, mime)], filename, { type: mime });
}

type ShareNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

// Can this device hand image files to the native share sheet? On iOS/Android
// that sheet is the only reliable route into Photos / Gallery, and it survives
// repeat use (unlike back-to-back programmatic <a download> clicks, which mobile
// browsers suppress after the first).
function canShareFiles(files: File[]): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as ShareNavigator;
  if (typeof nav.canShare !== 'function' || typeof nav.share !== 'function') return false;
  try {
    return nav.canShare({ files });
  } catch {
    return false;
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

// Direct file download via a freshly-created, immediately-torn-down anchor.
// Used as the desktop / no-share-support fallback.
function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Tear down on the next frame; revoke the URL once the download has had time
  // to start. Nothing is reused between calls.
  requestAnimationFrame(() => {
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
  });
}

/**
 * Save ONE slide. Prefers the native share sheet on mobile (the user taps
 * "Зберегти зображення" → it lands in the camera roll); falls back to a direct
 * file download where file-sharing isn't available (most desktops).
 */
export async function saveSlideImage(
  base64: string | null,
  filename: string,
  shareTitle?: string,
): Promise<SaveOutcome> {
  if (typeof document === 'undefined' || !base64) return 'failed';
  const file = base64ToFile(base64, filename);
  if (canShareFiles([file])) {
    try {
      await (navigator as ShareNavigator).share!({ files: [file], title: shareTitle });
      return 'shared';
    } catch (e) {
      // User dismissed the sheet — respect that, don't also force a download.
      if (isAbort(e)) return 'shared';
      // Any other share failure → fall through to a direct download.
    }
  }
  anchorDownload(base64ToBlob(base64), filename);
  return 'downloaded';
}

/**
 * Bulk save — each slide as its OWN file, in order, never a ZIP.
 *
 * On platforms that support multi-file sharing we hand the whole set to the
 * native sheet in a single gesture: the user saves them all to the gallery,
 * individually and in order. This is the reliable mobile path — N back-to-back
 * programmatic downloads get suppressed after the first on iOS/Android. Where
 * file-sharing isn't available we fall back to sequential per-file downloads,
 * each with freshly-created resources and spaced apart so the browser delivers
 * every one rather than dropping the later ones.
 */
export async function saveSlidesIndividually(
  slides: (string | null)[],
  opts: {
    baseName?: string;
    onProgress?: (done: number, total: number) => void;
    shareTitle?: string;
  } = {},
): Promise<SaveResult> {
  if (typeof document === 'undefined') return { count: 0, outcome: 'failed' };
  const baseName = opts.baseName ?? 'ruta-carousel';
  const present = slides
    .map((b64, i) => ({ b64, i }))
    .filter((s): s is { b64: string; i: number } => Boolean(s.b64));
  const total = present.length;
  if (total === 0) return { count: 0, outcome: 'failed' };

  const files = present.map(({ b64, i }) => base64ToFile(b64, `${baseName}-${i + 1}.png`));

  if (canShareFiles(files)) {
    try {
      await (navigator as ShareNavigator).share!({ files, title: opts.shareTitle });
      opts.onProgress?.(total, total);
      return { count: total, outcome: 'shared' };
    } catch (e) {
      if (isAbort(e)) return { count: total, outcome: 'shared' };
      // Otherwise fall through to sequential downloads below.
    }
  }

  let done = 0;
  for (const { b64, i } of present) {
    anchorDownload(base64ToBlob(b64), `${baseName}-${i + 1}.png`);
    done += 1;
    opts.onProgress?.(done, total);
    if (done < total) await delay(350);
  }
  return { count: done, outcome: 'downloaded' };
}
