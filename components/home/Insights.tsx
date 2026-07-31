'use client';

import Link from 'next/link';
import { ChevronRight, Flame } from 'lucide-react';
import {
  weekOverWeekLabel,
  type ProducerInsights,
} from '@/lib/insights/producerInsights';

/**
 * Your own performance, on the main page (§7).
 *
 * Deliberately NOT a nav tab and NOT inside Аналіз — Аналіз scrapes competitors,
 * which is a different job. Insights are ambient: you see them where the day
 * starts, glance, and get on with it. That is also what makes the streak work as
 * a loop rather than as a page you have to remember to visit.
 *
 * Every number here is OUTPUT (what you published, how steadily), never reach —
 * the app has no Instagram analytics yet, and a made-up reach number on the home
 * screen would poison the one place a number has to be trustworthy.
 */
export default function Insights({ insights }: { insights: ProducerInsights }) {
  const wow = weekOverWeekLabel(insights);
  const peak = Math.max(1, ...insights.weeks.map((w) => w.published));

  return (
    <section className="space-y-2.5" aria-labelledby="insights-heading">
      <div className="flex items-center justify-between px-0.5">
        <h2 id="insights-heading" className="app-section-label">
          Твій ритм
        </h2>
        <Link
          href="/insights"
          data-testid="insights-all-link"
          className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-[color:var(--accent)]"
        >
          Вся статистика
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="app-card px-4 py-4" data-testid="insights">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[30px] font-bold leading-none tabular-nums tracking-tight text-[color:var(--foreground)]">
              {insights.publishedThisWeek}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-snug text-[color:var(--text-muted)]">
              опубліковано цього тижня
            </p>
            {/* Its own line: inline, this wrapped under the streak chip and the
                two collided at narrow widths. */}
            {wow ? (
              <p
                className="mt-0.5 text-[12.5px] font-semibold leading-snug"
                style={{
                  color:
                    insights.publishedThisWeek >= insights.publishedLastWeek
                      ? 'var(--success)'
                      : '#b45309',
                }}
              >
                {wow}
              </p>
            ) : null}
          </div>

          {insights.streakWeeks > 1 ? (
            <div
              data-testid="insights-streak"
              className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5"
              style={{ backgroundColor: 'rgba(217,119,38,0.1)', color: '#b45309' }}
            >
              <Flame className="h-4 w-4" strokeWidth={2.2} />
              <span className="text-[13px] font-bold tabular-nums">
                {insights.streakWeeks} тижні поспіль
              </span>
            </div>
          ) : null}
        </div>

        {/* Seven weeks of output. Bars, not a line — you either posted that week
            or you didn't, and a line would imply values in between. */}
        <div className="mt-4 flex h-12 items-end gap-1.5" aria-hidden>
          {insights.weeks.map((w, i) => {
            const isCurrent = i === insights.weeks.length - 1;
            return (
              <div
                key={w.weekStart}
                className="flex-1 rounded-[4px] transition-[height]"
                style={{
                  height: `${Math.max(6, (w.published / peak) * 100)}%`,
                  backgroundColor: isCurrent
                    ? 'var(--accent)'
                    : w.published > 0
                      ? 'rgba(0,75,168,0.28)'
                      : 'var(--surface2)',
                }}
                title={`${w.weekStart}: ${w.published}`}
              />
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-4 border-t border-[color:var(--border)] pt-3 text-[12px]">
          <span className="text-[color:var(--text-muted)]">
            <span className="font-bold tabular-nums text-[color:var(--foreground)]">
              {insights.plannedAhead}
            </span>{' '}
            заплановано
          </span>
          <span className="text-[color:var(--text-muted)]">
            <span className="font-bold tabular-nums text-[color:var(--foreground)]">
              {insights.waiting}
            </span>{' '}
            чекає рішення
          </span>
          <span className="ml-auto text-[color:var(--text-muted)]">
            {Math.round(insights.publishedShare * 100)}% доведено до публікації
          </span>
        </div>
      </div>
    </section>
  );
}
