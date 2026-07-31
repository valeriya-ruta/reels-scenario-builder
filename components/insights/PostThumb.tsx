'use client';

import { useState } from 'react';
import { Film, LayoutGrid, BookOpen } from 'lucide-react';
import { thumbnailUrl } from '@/lib/insights/postedRanking';
import type { ContentPiece } from '@/lib/content/contentPiece';

const FALLBACK_ICON = { reel: Film, carousel: LayoutGrid, story: BookOpen, idea: Film } as const;

/**
 * A posted piece's thumbnail (Prompt 8).
 *
 * Three layers, in order: the scraped Instagram still, then the carousel's own
 * cover palette (which the app already renders on content cards), then a plain
 * type glyph. Instagram's CDN URLs are signed and expire, so a broken image is
 * an EXPECTED state — it degrades to the next layer instead of leaving a grey
 * hole in the list.
 */
export default function PostThumb({
  piece,
  size = 48,
}: {
  piece: ContentPiece;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const url = thumbnailUrl(piece);
  const cover = piece.preview?.cover;
  const Icon = FALLBACK_ICON[piece.type] ?? Film;

  const style = { width: size, height: Math.round(size * 1.25) };

  if (url && !broken) {
    return (
      /* Instagram CDN URLs are signed + expiring; next/image would need the host
         allow-listed and would cache a URL that dies. A plain <img> can simply
         fail over to the fallback below. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={style}
        className="shrink-0 rounded-[8px] object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ ...style, backgroundColor: cover?.background ?? 'var(--surface2)' }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[8px]"
    >
      {cover ? (
        <span
          className="line-clamp-4 px-1 text-[6.5px] font-bold leading-[1.25] tracking-tight"
          style={{ color: cover.titleColor }}
        >
          {piece.preview?.lead ?? piece.title}
        </span>
      ) : (
        <Icon className="h-4 w-4 text-[color:var(--text-muted)]" strokeWidth={1.8} />
      )}
    </span>
  );
}
