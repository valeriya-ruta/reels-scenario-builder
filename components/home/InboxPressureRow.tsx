'use client';

import Link from 'next/link';
import { ChevronRight, Inbox } from 'lucide-react';
import { NUDGE_AFTER_DAYS, unfinishedLine } from '@/lib/content/staging';

/**
 * The inbox, as ONE row on Home (Prompt 7).
 *
 * This is the inbox's only home in the app — there is no inbox tab and no
 * standalone inbox screen. The row is the entry point; tapping it opens the
 * staging list where each item has its three exits.
 *
 * The copy is pressure, not storage: «N ідей не завершені — давай їх
 * завершимо!» A neutral label («Чернетки», «Збережене») invites the pile to
 * grow, which is the failure mode staging exists to prevent. The count is the
 * pressure, so it renders as a badge and the row disappears entirely at zero —
 * an empty inbox should not sit on the home screen congratulating itself.
 */

export default function InboxPressureRow({
  count,
  overdue,
}: {
  count: number;
  /** How many have crossed the nudge threshold — the amber state. */
  overdue: number;
}) {
  if (count === 0) return null;

  const hot = overdue > 0;

  return (
    <Link
      href="/staging"
      data-testid="inbox-pressure-row"
      className="app-card flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[color:var(--surface1)]"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: hot ? 'rgba(217,119,38,0.12)' : 'var(--accent-soft)' }}
      >
        <Inbox
          className="h-5 w-5"
          strokeWidth={2}
          style={{ color: hot ? '#b45309' : 'var(--accent)' }}
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-[color:var(--foreground)]">
          {unfinishedLine(count)}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[color:var(--text-muted)]">
          {hot
            ? `${overdue} з них лежать понад ${NUDGE_AFTER_DAYS} днів`
            : 'Дата, доробити або відпустити'}
        </span>
      </span>

      <span
        data-testid="inbox-pressure-count"
        className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums text-white"
        style={{ backgroundColor: hot ? '#b45309' : 'var(--accent)' }}
      >
        {count}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" />
    </Link>
  );
}
