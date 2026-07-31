'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import PostRow from '@/components/insights/PostRow';
import {
  DEFAULT_SORT,
  postedPieces,
  rankPosted,
  winnerIds,
} from '@/lib/insights/postedRanking';
import type { ContentPiece } from '@/lib/content/contentPiece';

/** How many rows the home preview shows before handing off to the tab. */
const PREVIEW_ROWS = 2;

/**
 * СТАТИСТИКА on Home (Prompt 7) — a PREVIEW of the Insights tab, not a second
 * system. It calls the same `postedRanking` functions on the same pieces with
 * the same default sort, so the top rows here are by construction the top rows
 * there; «більше» routes to the tab rather than to a parallel view.
 */
export default function StatsPreview({ pieces }: { pieces: ContentPiece[] }) {
  const { top, winners } = useMemo(() => {
    const posted = postedPieces(pieces);
    return {
      top: rankPosted(posted, DEFAULT_SORT).slice(0, PREVIEW_ROWS),
      winners: winnerIds(posted),
    };
  }, [pieces]);

  return (
    <section className="space-y-2.5" aria-labelledby="stats-heading">
      <div className="flex items-center justify-between px-0.5">
        <h2 id="stats-heading" className="app-section-label">
          Статистика
        </h2>
        <Link
          href="/insights"
          data-testid="stats-more-link"
          className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-[color:var(--accent)]"
        >
          більше
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {top.length === 0 ? (
        <div className="app-card px-4 py-5" data-testid="stats-empty">
          <p className="text-[14.5px] font-semibold leading-snug text-[color:var(--foreground)]">
            Ще немає посилань на пости
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--text-muted)]">
            Познач щось як «Опубліковано» і кинь посилання — і тут зʼявиться, як воно зайшло.
          </p>
        </div>
      ) : (
        <ul className="app-card divide-y divide-[color:var(--border)] px-4" data-testid="stats-preview">
          {top.map((piece) => (
            <PostRow
              key={piece.id}
              piece={piece}
              headline={DEFAULT_SORT === 'date' ? 'views' : DEFAULT_SORT}
              isWinnerPost={winners.has(piece.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
