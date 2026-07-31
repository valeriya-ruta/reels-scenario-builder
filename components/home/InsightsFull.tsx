'use client';

import { ChevronLeft, Flame } from 'lucide-react';
import BackLink from '@/components/ui/BackLink';
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
          <h1 className="app-title">Твій ритм</h1>
        </div>

        {/* Say what these numbers are, before showing any of them. */}
        <p className="mb-5 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface1)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[color:var(--text-secondary)]">
          Це про твій <strong className="font-semibold">випуск</strong>: що ти довела до публікації і
          наскільки рівно. Охоплення й перегляди зʼявляться, коли підключимо Instagram.
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
