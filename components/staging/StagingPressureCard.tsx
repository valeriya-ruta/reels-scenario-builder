'use client';

import Link from 'next/link';
import { Inbox, ChevronRight } from 'lucide-react';
import { stagingSummary, NUDGE_AFTER_DAYS } from '@/lib/content/staging';

/**
 * The staging count, surfaced where the user actually looks.
 *
 * The count IS the pressure — a number that only goes down when decisions get
 * made. It renders nothing at zero: an empty Розбір should disappear rather
 * than sit on the home screen congratulating itself.
 */
export default function StagingPressureCard({
  count,
  overdue,
}: {
  count: number;
  /** How many have crossed the nudge threshold. */
  overdue: number;
}) {
  if (count === 0) return null;

  return (
    <Link
      href="/staging"
      data-testid="staging-pressure-card"
      className="app-card flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[color:var(--surface1)]"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: overdue > 0 ? 'rgba(217,119,38,0.12)' : 'var(--accent-soft)',
        }}
      >
        <Inbox
          className="h-5 w-5"
          strokeWidth={2}
          style={{ color: overdue > 0 ? '#b45309' : 'var(--accent)' }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-[color:var(--foreground)]">
          {stagingSummary(count)}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[color:var(--text-muted)]">
          {overdue > 0
            ? `${overdue} з них лежать понад ${NUDGE_AFTER_DAYS} днів`
            : 'Дата, доробити або відпустити'}
        </span>
      </span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums text-white"
        style={{ backgroundColor: overdue > 0 ? '#b45309' : 'var(--accent)' }}
      >
        {count}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" />
    </Link>
  );
}
