/**
 * "Something just went live" — one event, one listener, every path.
 *
 * Status can be changed from at least four places: the pill in each editor, the
 * ring on a content card, the ring in a per-type list, and the ring in a
 * calendar day. The link pop-up was originally wired only to the pill, so
 * publishing from a card — the most common way, and the one on the main tab —
 * silently did nothing.
 *
 * Rather than repeat the pop-up in four components, every path now announces the
 * transition and ONE host renders the sheet.
 */

import type { ContentPiece } from '@/lib/content/contentPiece';

export const CONTENT_PUBLISHED_EVENT = 'ruta:content-published';

export type ContentPublishedDetail = {
  refTable: ContentPiece['refTable'];
  id: string;
};

/** Announce that a piece just reached Опубліковано. Safe to call on the server. */
export function dispatchContentPublished(
  refTable: ContentPiece['refTable'],
  id: string,
): void {
  if (typeof window === 'undefined') return;
  // Ideas are not posted things — they have no link to give.
  if (refTable === 'ideas') return;
  window.dispatchEvent(
    new CustomEvent<ContentPublishedDetail>(CONTENT_PUBLISHED_EVENT, {
      detail: { refTable, id },
    }),
  );
}
