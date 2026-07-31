'use client';

import { ChevronLeft, Clock, ExternalLink, TrendingUp } from 'lucide-react';
import BackLink from '@/components/ui/BackLink';
import PostThumb from '@/components/insights/PostThumb';
import { displayTitle } from '@/lib/content/displayTitle';
import { dayHeaderLabel } from '@/lib/content/calendar';
import { TYPE_LABELS } from '@/lib/content/statusSystem';
import { formatMetric, isPending, metric } from '@/lib/insights/postedRanking';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * One posted piece (Prompt 8) — LEAN, on purpose.
 *
 * Thumbnail, title, the core scraped counts shown big, and a link out to the
 * real post. Nothing else. Reach, watch time and source-of-views belong to the
 * Graph era; the layout leaves room for them but renders nothing for them now.
 * A stubbed "Утримання — %" panel would be a promise the app cannot keep.
 */
export default function PostInsightsView({
  piece,
  isWinnerPost,
}: {
  piece: ContentPiece;
  isWinnerPost: boolean;
}) {
  const pending = isPending(piece);
  const counts = (['views', 'likes', 'comments'] as const)
    .map((key) => ({ key, value: metric(piece, key) }))
    .filter((m) => m.value !== null);

  const LABELS = { views: 'Перегляди', likes: 'Вподобання', comments: 'Коментарі' };

  return (
    <div className="app-canvas">
      <div className="app-page">
        <div className="mb-4 flex items-center gap-1">
          <BackLink fallbackHref="/insights" ariaLabel="Назад" className="app-icon-btn shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </BackLink>
          <h1 className="app-title truncate">Пост</h1>
        </div>

        <div className="app-card flex items-start gap-3.5 px-4 py-4">
          <PostThumb piece={piece} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="min-w-0 flex-1 text-[16px] font-semibold leading-snug tracking-tight text-[color:var(--foreground)]">
                {displayTitle(piece.title, piece.type)}
              </p>
              {isWinnerPost ? (
                <span
                  data-testid="post-winner"
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: 'rgba(22,163,74,0.12)', color: 'var(--success)' }}
                >
                  <TrendingUp className="h-3 w-3" strokeWidth={2.4} />
                  ХІТ
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[12.5px] text-[color:var(--text-muted)]">
              {TYPE_LABELS[piece.type]}
              {piece.postedAt ? ` · ${dayHeaderLabel(piece.postedAt.slice(0, 10))}` : ''}
            </p>
          </div>
        </div>

        {pending ? (
          <div
            data-testid="post-pending"
            className="app-card mt-3 flex items-center gap-2.5 px-4 py-5"
          >
            <Clock className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" strokeWidth={2} />
            <p className="text-[13.5px] leading-relaxed text-[color:var(--text-secondary)]">
              Щойно опубліковано · дані скоро. Статистика підтягнеться, щойно Instagram її віддасть.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5" data-testid="post-metrics">
            {counts.map((m) => (
              <div key={m.key} className="app-card px-4 py-4">
                <p className="text-[30px] font-bold leading-none tabular-nums tracking-tight text-[color:var(--foreground)]">
                  {formatMetric(m.value as number)}
                </p>
                <p className="mt-1.5 text-[12px] leading-snug text-[color:var(--text-muted)]">
                  {LABELS[m.key]}
                </p>
              </div>
            ))}
          </div>
        )}

        {piece.postedUrl ? (
          <a
            href={piece.postedUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="post-open-link"
            className="app-pill mt-3 w-full justify-center py-3"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={2} />
            Відкрити пост в Instagram
          </a>
        ) : null}
      </div>
    </div>
  );
}
