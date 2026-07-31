'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles, Trophy } from 'lucide-react';
import PostRow from '@/components/insights/PostRow';
import PostThumb from '@/components/insights/PostThumb';
import { displayTitle } from '@/lib/content/displayTitle';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';
import {
  DEFAULT_SORT,
  METRIC_LABELS,
  SORT_LABELS,
  SORT_ORDER,
  formatMetric,
  metric,
  postedPieces,
  rankPosted,
  topPerformer,
  winnerIds,
  type InsightsSort,
} from '@/lib/insights/postedRanking';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Інсайти — the tab (Prompt 8).
 *
 * LINK-BASED, September scope. Every number here comes from scraping the links
 * the user logs: views, likes, comments. Reach, saves, watch time, retention
 * and source-of-views are Graph-era metrics Instagram publishes only to the
 * account owner — so this screen does not render them, not even as empty rows.
 * An "Охоплення: —" placeholder would read as a bug or a broken pull rather
 * than as a thing the platform does not give us; the layout simply has room to
 * grow into them later.
 *
 * The list dominates. The sort bar defines what "best" means (the user's call,
 * not ours), the top performer is pulled out above it because that card is the
 * emotional payoff of the whole loop, and the two hand-offs below are
 * deliberately quiet pills so they never compete with the list.
 */
export default function InsightsTab({ pieces }: { pieces: ContentPiece[] }) {
  const [sort, setSort] = useState<InsightsSort>(DEFAULT_SORT);

  const posted = useMemo(() => postedPieces(pieces), [pieces]);
  const winners = useMemo(() => winnerIds(posted), [posted]);
  const ranked = useMemo(() => rankPosted(posted, sort), [posted, sort]);
  const top = useMemo(() => topPerformer(ranked, winners), [ranked, winners]);

  // The big number follows the sort — you sorted by likes, you read likes.
  const headline = sort === 'date' ? 'views' : sort;
  const rest = top ? ranked.filter((p) => p.id !== top.id) : ranked;

  return (
    <div className="app-canvas">
      <div className="app-page">
        <div className="px-0.5">
          <h1 className="app-title">Інсайти</h1>
          <p className="app-subtitle">
            {posted.length === 0
              ? 'Кинь посилання на пост — і побачиш, як він зайшов'
              : `${posted.length} постів із посиланням`}
          </p>
        </div>

        {posted.length === 0 ? (
          <div className="app-card mt-6 px-5 py-8 text-center" data-testid="insights-empty">
            <p className="text-[14px] font-semibold text-[color:var(--foreground)]">
              Ще немає посилань на пости
            </p>
            <p className="mx-auto mt-1.5 max-w-[22rem] text-[13px] leading-relaxed text-[color:var(--text-muted)]">
              Познач щось як «Опубліковано» і кинь посилання — і тут зʼявиться, як воно зайшло.
            </p>
          </div>
        ) : (
          <>
            {/* Sort bar — «найкраще» is whatever the user says it is. */}
            <div
              role="group"
              aria-label="Сортування"
              data-testid="insights-sort"
              className="mt-4 flex gap-1.5 overflow-x-auto pb-1"
            >
              {SORT_ORDER.map((key) => {
                const active = key === sort;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    aria-pressed={active}
                    data-testid={`insights-sort-${key}`}
                    className="app-pill shrink-0 py-1.5"
                    style={
                      active
                        ? {
                            backgroundColor: 'var(--accent)',
                            borderColor: 'var(--accent)',
                            color: '#fff',
                          }
                        : undefined
                    }
                  >
                    {SORT_LABELS[key]}
                  </button>
                );
              })}
            </div>

            {top ? <TopPerformerCard piece={top} headline={headline} isWinnerPost={winners.has(top.id)} /> : null}

            <ul className="app-card mt-3 divide-y divide-[color:var(--border)] px-4" data-testid="insights-list">
              {rest.map((piece) => (
                <PostRow
                  key={piece.id}
                  piece={piece}
                  headline={headline}
                  isWinnerPost={winners.has(piece.id)}
                />
              ))}
              {rest.length === 0 ? (
                <li className="py-5 text-center text-[13px] text-[color:var(--text-muted)]">
                  Поки що це єдиний пост із посиланням.
                </li>
              ) : null}
            </ul>
          </>
        )}

        {/* SECONDARY — visibly quieter than the list, and below it. */}
        <section className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            data-testid="insights-from-winners"
            disabled={top === null}
            onClick={() => {
              if (!top) return;
              // Seeds the braindump with the angle that already worked — the
              // same object winner-detection flagged, so «go deeper» is always
              // about a post that actually performed.
              window.dispatchEvent(
                new CustomEvent(OPEN_BRAINDUMP_FRESH_EVENT, {
                  detail: {
                    angle: {
                      id: `winner-${top.id}`,
                      title: `Ще один заход на «${displayTitle(top.title, top.type)}»`,
                      rationale: 'Цей пост зайшов краще за твою медіану — тут ще є що сказати.',
                      seed: `Розвинути тему «${displayTitle(top.title, top.type)}» — що я не договорила минулого разу.`,
                      suggestedType: null,
                      source: 'proven',
                    },
                  },
                }),
              );
            }}
            className="app-pill w-full justify-center py-3 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2} />
            Ідеї на основі топ-контенту
          </button>
          <Link
            href="/competitor-analysis"
            data-testid="insights-competitor"
            className="app-pill w-full justify-center py-3"
          >
            <Search className="h-4 w-4" strokeWidth={2} />
            Аналіз конкурента
          </Link>
        </section>

        {/* Said once, at the bottom: what these numbers are and are not. */}
        <p className="mt-5 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface1)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[color:var(--text-secondary)]">
          Перегляди, вподобання і коментарі підтягуються з посилань, які ти додаєш. Охоплення,
          збереження й утримання бачить лише сам акаунт — вони зʼявляться, коли підключимо
          Instagram напряму.
        </p>
      </div>
    </div>
  );
}

/**
 * The top performer, pulled out above the list.
 *
 * Visually distinct on purpose — this is the same object that feeds winner
 * detection, the idea deck's quality promotion and the braindump's «this
 * worked, go deeper» prompt, so it earns the prominence.
 */
function TopPerformerCard({
  piece,
  headline,
  isWinnerPost,
}: {
  piece: ContentPiece;
  headline: 'views' | 'likes' | 'comments';
  isWinnerPost: boolean;
}) {
  const big = metric(piece, headline);
  const secondaries = (['views', 'likes', 'comments'] as const)
    .filter((k) => k !== headline)
    .map((k) => ({ key: k, value: metric(piece, k) }))
    .filter((m) => m.value !== null);

  return (
    <Link
      href={`/insights/${piece.id}`}
      data-testid="insights-top-performer"
      className="mt-3 flex items-center gap-3.5 rounded-[18px] px-4 py-4"
      style={{
        background: 'linear-gradient(135deg, rgba(0,75,168,0.10), rgba(22,163,74,0.10))',
        border: '1px solid rgba(0,75,168,0.22)',
      }}
    >
      <PostThumb piece={piece} size={56} />
      <span className="min-w-0 flex-1">
        <span
          className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.06em]"
          style={{ color: 'var(--accent)' }}
        >
          <Trophy className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          {isWinnerPost ? 'Твій хіт' : 'Найкращий пост'}
        </span>
        <span className="mt-0.5 block truncate text-[15px] font-semibold leading-snug text-[color:var(--foreground)]">
          {displayTitle(piece.title, piece.type)}
        </span>
        {big !== null ? (
          <span className="mt-1 block text-[28px] font-bold leading-none tabular-nums tracking-tight text-[color:var(--foreground)]">
            {formatMetric(big)}
            <span className="ml-1.5 text-[12px] font-medium text-[color:var(--text-muted)]">
              {METRIC_LABELS[headline]}
            </span>
          </span>
        ) : null}
        {secondaries.length > 0 ? (
          <span className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] text-[color:var(--text-secondary)]">
            {secondaries.map((m) => (
              <span key={m.key}>
                {formatMetric(m.value as number)} {METRIC_LABELS[m.key]}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
