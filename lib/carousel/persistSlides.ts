import type { Slide } from '@/lib/carouselTypes';
import { approxJsonBytes, MAX_SAVE_PAYLOAD_BYTES } from '@/lib/carousel/bgImage';

export type PersistResult = { ok: boolean; error?: string; tooLarge?: boolean };

/**
 * Persist carousel slides via the autosave Route Handler (single source of
 * truth). Unlike the old Server Action this has no 1 MB body cap, so slides
 * carrying a base64 background photo save successfully.
 *
 * Pass `keepalive` for the flush-on-hide path so the browser completes the
 * write even as the tab/app is being backgrounded or closed. (keepalive caps
 * the body at ~64 KB, so an image-bearing flush may be rejected — that's fine:
 * heavy edits are persisted immediately while the app is still alive, and the
 * keepalive flush is the safety net for the last small/text edit.)
 */
export async function persistCarouselSlides(
  projectId: string,
  slides: Slide[],
  opts: { keepalive?: boolean } = {},
): Promise<PersistResult> {
  const payload = { project_id: projectId, slides };
  // Refuse oversized payloads before they hit Vercel's ~4.5 MB body cap (which
  // returns HTTP 413 and used to silently drop the edit). With photos now
  // compressed on upload this should never trip in normal use; if it does, the
  // caller surfaces a clear message instead of losing work.
  if (approxJsonBytes(payload) > MAX_SAVE_PAYLOAD_BYTES) {
    return { ok: false, tooLarge: true, error: 'PAYLOAD_TOO_LARGE' };
  }
  try {
    const res = await fetch('/api/carousel/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: opts.keepalive,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data?.error) msg = data.error;
      } catch {
        /* ignore parse error */
      }
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}
