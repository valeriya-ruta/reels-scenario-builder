/**
 * Window event used to open the global repurpose overlay.
 *
 * Same pattern as the braindump overlay (see braindumpIdeaEvent.ts): the overlay
 * is mounted ONCE by BottomNav so it is available on every screen, and any
 * entry point — the mobile create menu, the desktop sidebar, a future "переробити
 * цей пост" row — just dispatches this instead of owning its own copy.
 */
export const OPEN_REPURPOSE_EVENT = 'ruta:open-repurpose';

/** Optional payload: a link the caller already has, pre-filled into the box. */
export type OpenRepurposeDetail = { url?: string } | undefined;

export function dispatchOpenRepurpose(url?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_REPURPOSE_EVENT, { detail: url ? { url } : undefined }));
}
