'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, Flame, Sparkles, Search, TrendingUp } from 'lucide-react';
import BackLink from '@/components/ui/BackLink';
import ContentTypeIcon from '@/components/ContentTypeIcon';
import { displayTitle } from '@/lib/content/displayTitle';
import { primaryMetric, isWinner } from '@/lib/insights/postedLink';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';
import { TYPE_LABELS, STATUS_LABELS, STATUS_COLORS, CONTENT_STATUSES } from '@/lib/content/statusSystem';
import { dayHeaderLabel } from '@/lib/content/calendar';
import type { ProducerInsights } from '@/lib/insights/producerInsights';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * The fuller insights view (§7's "see all").
 *
 * Same honesty rule as the home card: everything here is OUTPUT, never reach.
 * The banner says so out loud rather than letting the user assume these are
 * Instagram numbers — an unlabelled chart on a content app reads as reach, and
 * that assumption would make every number here a lie by omission.
 */
export default function InsightsFull({
  insights,
  pieces,
}: {
  insights: ProducerInsights;
  pieces: ContentPiece[];
}) {
  const real = pieces.filter((p) => p.refTable !== 'ideas');
  const peak = Math.max(1, ...insights.weeks.map((w) => w.published));

  // Posted pieces, best first — the list IS the tab.
  const posted = useMemo(
    () =>
      real
        .filter((p) => p.postedUrl)
        .sort((a, b) => (primaryMetric(b.insights) ?? -1) - (primaryMetric(a.insights) ?? -1)),
    [real],
  );

  // Winners are relative to this account's own median (see postedLink).
  const winnerIds = useMemo(() => {
    const values = posted
      .map((p) => primaryMetric(p.insights))
      .filter((v): v is number => v !== null);
    return new Set(
      posted.filter((p) => isWinner(primaryMetric(p.insights), values)).map((p) => p.id),
    );
  }, [posted]);

  // Best-performing post, for the "mine your winners" handoff.
  const topPost = posted.find((p) => winnerIds.has(p.id)) ?? posted[0] ?? null;

  const byType = (['reel', 'carousel', 'story'] as const).map((type) => ({
    type,
    total: real.filter((p) => p.type === type).length,
    published: real.filter((p) => p.type === type && p.status === 'published').length,
  }));

  const byStatus = CONTENT_STATUSES.map((status) => ({
    status,
    count: real.filter((p) => p.status === status).length,
  })).filter((s) => s.count > 0);

  return (
    <div className="app-canvas">
      <div className="app-page">
        <div className="mb-4 flex items-center gap-1">
          <BackLink fallbackHref="/dashboard" ariaLabel="Назад" className="app-icon-btn shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </BackLink>
          <h1 className="app-title">Інсайти</h1>
        </div>

        {/* Say what these numbers are, before showing any of them. */}
        <p className="mb-5 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface1)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[color:var(--text-secondary)]">
          Перегляди, вподобання і коментарі підтягуються з посилань, які ти додаєш. Охоплення
          і збереження бачить лише сам акаунт — вони зʼявляться, коли підключимо Instagram
          напряму.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <Stat value={insights.publishedThisWeek} label="цього тижня" />
          <Stat value={insights.publishedLastWeek} label="минулого тижня" />
          <Stat value={insights.plannedAhead} label="заплановано" />
          <Stat value={insights.waiting} label="чекає рішення" />
        </div>

        {insights.streakWeeks > 1 ? (
          <div
            className="mt-2.5 flex items-center gap-2 rounded-[14px] px-4 py-3"
            style={{ backgroundColor: 'rgba(217,119,38,0.1)', color: '#b45309' }}
          >
            <Flame className="h-5 w-5 shrink-0" strokeWidth={2.2} />
            <span className="text-[14px] font-semibold">
              {insights.streakWeeks} тижні поспіль із публікаціями
            </span>
          </div>
        ) : null}

        {/* PRIMARY (Prompt 5): what you posted, with its pulled numbers. This
            is the hero of the tab — the aggregates below are context. */}
        <section className="mt-6">
          <h2 className="app-section-label mb-2 px-0.5">Твої пости</h2>
          {posted.length === 0 ? (
            <div className="app-card px-5 py-8 text-center">
              <p className="text-[14px] font-semibold text-[color:var(--foreground)]">
                Ще немає посилань на пости
              </p>
              <p className="mx-auto mt-1.5 max-w-[22rem] text-[13px] leading-relaxed text-[color:var(--text-muted)]">
                Познач щось як «Опубліковано» і кинь посилання — і тут зʼявиться, як воно
                зайшло.
              </p>
            </div>
          ) : (
            <ul className="app-card divide-y divide-[color:var(--border)] px-4">
              {posted.map((p) => (
                <PostedRow key={p.id} piece={p} isWinnerPost={winnerIds.has(p.id)} />
              ))}
            </ul>
          )}
        </section>

        {/* SECONDARY (Prompt 5): visibly quieter, under the list, not competing. */}
        <section className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            data-testid="insights-from-winners"
            disabled={topPost === null}
            onClick={() => {
              if (!topPost) return;
              // Seeds the braindump with the angle that already worked. The full
              // swipe deck (Prompt 6) will consume the same signal.
              window.dispatchEvent(
                new CustomEvent(OPEN_BRAINDUMP_FRESH_EVENT, {
                  detail: {
                    angle: {
                      id: `winner-${topPost.id}`,
                      title: `Ще один заход на «${displayTitle(topPost.title, topPost.type)}»`,
                      rationale: 'Цей пост зайшов краще за твою медіану — тут ще є що сказати.',
                      seed: `Розвинути тему «${displayTitle(topPost.title, topPost.type)}» — що я не договорила минулого разу.`,
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
            Ідеї з твоїх найкращих постів
          </button>
          <Link href="/competitor-analysis" className="app-pill w-full justify-center py-3">
            <Search className="h-4 w-4" strokeWidth={2} />
            Розібрати конкурента
          </Link>
        </section>

        <section className="mt-6">
          <h2 className="app-section-label mb-2 px-0.5">Останні тижні</h2>
          <div className="app-card px-4 py-4">
            <div className="flex h-24 items-end gap-2" aria-hidden>
              {insights.weeks.map((w, i) => (
                <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[11px] font-bold tabular-nums text-[color:var(--text-muted)]">
                    {w.published || ''}
                  </span>
                  <div
                    className="w-full rounded-[4px]"
                    style={{
                      height: `${Math.max(6, (w.published / peak) * 100)}%`,
                      backgroundColor:
                        i === insights.weeks.length - 1
                          ? 'var(--accent)'
                          : w.published > 0
                            ? 'rgba(0,75,168,0.28)'
                            : 'var(--surface2)',
                    }}
                  />
                  <span className="text-[10px] text-[color:var(--text-muted)]">
                    {dayHeaderLabel(w.weekStart)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="app-section-label mb-2 px-0.5">За форматом</h2>
          <div className="app-card divide-y divide-[color:var(--border)] px-4">
            {byType.map((t) => (
              <div key={t.type} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1 text-[14px] font-semibold text-[color:var(--foreground)]">
                  {TYPE_LABELS[t.type]}
                </span>
                <span className="text-[13px] tabular-nums text-[color:var(--text-muted)]">
                  {t.published} / {t.total} опубліковано
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="app-section-label mb-2 px-0.5">Де все зараз</h2>
          <div className="app-card divide-y divide-[color:var(--border)] px-4">
            {byStatus.map((s) => (
              <div key={s.status} className="flex items-center gap-3 py-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[s.status] }}
                />
                <span className="min-w-0 flex-1 text-[14px] font-medium text-[color:var(--foreground)]">
                  {STATUS_LABELS[s.status]}
                </span>
                <span className="text-[13px] font-bold tabular-nums text-[color:var(--foreground)]">
                  {s.count}
                </span>
              </div>
            ))}
            {byStatus.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[color:var(--text-muted)]">
                Поки що нічого немає.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

/** One posted piece with its pulled numbers. */
function PostedRow({ piece, isWinnerPost }: { piece: ContentPiece; isWinnerPost: boolean }) {
  const m = piece.insights ?? {};
  const views = typeof m.views === 'number' ? m.views : null;
  const likes = typeof m.likes === 'number' ? m.likes : null;
  const comments = typeof m.comments === 'number' ? m.comments : null;

  return (
    <li className="flex items-start gap-3 py-3.5">
      <span className="mt-0.5 shrink-0">
        <ContentTypeIcon
          type={piece.type === 'carousel' ? 'carousel' : piece.type === 'story' ? 'stories' : 'reels'}
          size={16}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-[14.5px] font-semibold text-[color:var(--foreground)]">
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
        {/* Only metrics we actually have. A carousel has no views, and an
            unpulled post has nothing — neither should render as a zero. */}
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[color:var(--text-muted)]">
          {views !== null ? <span>{views.toLocaleString('uk-UA')} переглядів</span> : null}
          {likes !== null ? <span>{likes.toLocaleString('uk-UA')} вподобань</span> : null}
          {comments !== null ? <span>{comments.toLocaleString('uk-UA')} коментарів</span> : null}
          {views === null && likes === null && comments === null ? (
            <span>Статистика ще не підтягнута</span>
          ) : null}
        </span>
      </span>
      {piece.postedUrl ? (
        <a
          href={piece.postedUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-[12px] font-semibold text-[color:var(--accent)]"
        >
          Пост
        </a>
      ) : null}
    </li>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="app-card px-4 py-3.5">
      <p className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-[color:var(--foreground)]">
        {value}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug text-[color:var(--text-muted)]">{label}</p>
    </div>
  );
}
