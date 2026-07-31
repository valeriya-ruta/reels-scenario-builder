'use client';

import Link from 'next/link';
import { Clock, TrendingUp } from 'lucide-react';
import PostThumb from '@/components/insights/PostThumb';
import { displayTitle } from '@/lib/content/displayTitle';
import { formatMetric, isPending, metric } from '@/lib/insights/postedRanking';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * One posted piece in the insights list (Prompt 8).
 *
 * Thumbnail · title · ONE headline metric big · two secondaries small. The list
 * is meant to be scanned down the big number, so exactly one number is allowed
 * to be big — the one the current sort is on.
 *
 * A just-posted piece shows «дані скоро» with a clock. It never shows zeros: a
 * fabricated 0 reads as a failed post, and the user would act on it.
 */
export default function PostRow({
  piece,
  headline,
  isWinnerPost = false,
}: {
  piece: ContentPiece;
  /** Which metric is the big one — follows the active sort. */
  headline: 'views' | 'likes' | 'comments';
  isWinnerPost?: boolean;
}) {
  const pending = isPending(piece);
  const big = metric(piece, headline);
  const secondaries = (['views', 'likes', 'comments'] as const)
    .filter((k) => k !== headline)
    .map((k) => ({ key: k, value: metric(piece, k) }))
    .filter((m) => m.value !== null);

  const SECONDARY_LABEL = { views: 'переглядів', likes: 'вподобань', comments: 'коментарів' };

  return (
    <li>
      <Link
        href={`/insights/${piece.id}`}
        data-testid="insights-row"
        className="flex items-center gap-3 py-3 transition-colors"
      >
        <PostThumb piece={piece} size={44} />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[14.5px] font-semibold leading-snug text-[color:var(--foreground)]">
              {displayTitle(piece.title, piece.type)}
            </span>
            {isWinnerPost ? (
              <span
                data-testid="insights-winner"
                title="Зайшло краще за твою медіану"
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: 'rgba(22,163,74,0.12)', color: 'var(--success)' }}
              >
                <TrendingUp className="h-3 w-3" strokeWidth={2.4} />
                ХІТ
              </span>
            ) : null}
          </span>

          {pending ? (
            <span
              data-testid="insights-pending"
              className="mt-1 flex items-center gap-1 text-[12px] text-[color:var(--text-muted)]"
            >
              <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
              щойно опубліковано · дані скоро
            </span>
          ) : (
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {big !== null ? (
                <span className="text-[19px] font-bold leading-tight tabular-nums tracking-tight text-[color:var(--foreground)]">
                  {formatMetric(big)}
                  <span className="ml-1 text-[11px] font-medium text-[color:var(--text-muted)]">
                    {SECONDARY_LABEL[headline]}
                  </span>
                </span>
              ) : null}
              {secondaries.map((m) => (
                <span key={m.key} className="text-[11.5px] text-[color:var(--text-muted)]">
                  {formatMetric(m.value as number)} {SECONDARY_LABEL[m.key]}
                </span>
              ))}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
