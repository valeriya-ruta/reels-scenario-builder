'use client';

import { useCallback, useEffect, useState } from 'react';
import PostedLinkSheet from '@/components/posted/PostedLinkSheet';
import { countPostedLinks } from '@/app/posted-actions';
import {
  CONTENT_PUBLISHED_EVENT,
  type ContentPublishedDetail,
} from '@/lib/content/postedLinkEvent';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * The ONE mount of the link pop-up, app-wide.
 *
 * Mounted once in the shell so publishing from anywhere — an editor's status
 * pill, a card's status ring on Головна, a per-type list, a calendar day —
 * opens the same sheet. Previously only the editor pill knew about it, so the
 * most common path (the ring on the main tab) published silently.
 */
export default function PostedLinkHost() {
  const [target, setTarget] = useState<
    { refTable: ContentPiece['refTable']; id: string } | null
  >(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const onPublished = (e: Event) => {
      const detail = (e as CustomEvent<ContentPublishedDetail>).detail;
      if (!detail) return;
      // Fetch the count first so the "ще N постів" line is real from the first
      // frame rather than flickering up from zero.
      void countPostedLinks().then((n) => {
        setCount(n);
        setTarget({ refTable: detail.refTable, id: detail.id });
      });
    };
    window.addEventListener(CONTENT_PUBLISHED_EVENT, onPublished);
    return () => window.removeEventListener(CONTENT_PUBLISHED_EVENT, onPublished);
  }, []);

  const close = useCallback(() => setTarget(null), []);

  if (!target) return null;

  return (
    <PostedLinkSheet
      open
      onClose={close}
      refTable={target.refTable}
      id={target.id}
      count={count}
    />
  );
}
