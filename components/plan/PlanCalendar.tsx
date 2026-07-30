'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ContentRows from '@/components/content/ContentRows';
import PlanCreateMenu from '@/components/plan/PlanCreateMenu';
import type { ContentPiece } from '@/lib/content/contentPiece';
import {
  monthGrid,
  monthLabel,
  shiftMonth,
  groupByScheduledDate,
  dayHeaderLabel,
  dateKey,
  WEEKDAY_LABELS,
} from '@/lib/content/calendar';

/**
 * План content calendar (task 86d3d23nj). Minimalist Sun–Sat month grid with a
 * top-right NUMBER BADGE per day (count of scheduled content), subtle accent
 * "today", filled-accent-circle selection, and a detail panel that reuses the
 * real ContentRows card below the grid. Scheduling itself happens elsewhere
 * (schedule chip / swipe date action) — this is the viewing surface.
 */
export default function PlanCalendar({ pieces }: { pieces: ContentPiece[] }) {
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const [view, setView] = useState(() => ({ year: now.getFullYear(), month0: now.getMonth() }));
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => groupByScheduledDate(pieces), [pieces]);
  const cells = useMemo(
    () => monthGrid(view.year, view.month0, todayKey),
    [view.year, view.month0, todayKey],
  );

  const dayPieces = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="app-page">
      {/* Header: Month YYYY + arrows */}
      <div className="mb-4 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-[color:var(--foreground)]">
            План
          </h1>
          <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
            {monthLabel(view.year, view.month0)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Попередній місяць"
            data-testid="cal-prev"
            onClick={() => setView((v) => shiftMonth(v.year, v.month0, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Наступний місяць"
            data-testid="cal-next"
            onClick={() => setView((v) => shiftMonth(v.year, v.month0, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Calendar card */}
      <div className="app-card px-2 pb-2 pt-3">
      {/* Weekday header */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const count = byDay.get(cell.key)?.length ?? 0;
          const isSelected = selected === cell.key;
          return (
            <button
              key={cell.key}
              type="button"
              data-testid="cal-day"
              data-day={cell.key}
              data-count={count}
              data-selected={isSelected ? 'true' : 'false'}
              onClick={() => setSelected(cell.key)}
              className="relative flex aspect-square items-center justify-center"
            >
              {/* Selected fill (wins over today's accent text). */}
              <span
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors"
                style={{
                  backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                  color: isSelected
                    ? '#fff'
                    : !cell.inMonth
                      ? '#c4c4cc'
                      : cell.isToday
                        ? 'var(--accent)'
                        : 'var(--foreground)',
                  fontWeight: cell.isToday || isSelected ? 700 : 400,
                }}
              >
                {cell.day}
              </span>

              {/* Count badge, top-right. Inverts when the day is selected. */}
              {count > 0 && (
                <span
                  data-testid="cal-badge"
                  className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
                  style={{
                    backgroundColor: isSelected ? '#fff' : 'var(--accent)',
                    color: isSelected ? 'var(--accent)' : '#fff',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      </div>

      {/* Detail panel */}
      <div className="mt-5" data-testid="cal-detail">
        {!selected ? (
          <p className="px-2 py-8 text-center text-[13px] text-[color:var(--text-muted)]">
            Обери дату, щоб побачити деталі.
          </p>
        ) : (
          <div>
            <div className="mb-2.5 flex items-center justify-between px-0.5">
              <h2 className="app-section-label">{dayHeaderLabel(selected)}</h2>
              {/* Create is always available on a selected day — full state or empty. */}
              <PlanCreateMenu />
            </div>
            {dayPieces.length > 0 ? (
              <div className="app-card overflow-hidden px-1.5 py-0.5">
                <ContentRows pieces={dayPieces} />
              </div>
            ) : (
              <div className="app-card px-6 py-9 text-center">
                <p className="text-[14px] font-semibold text-[color:var(--foreground)]">
                  Нічого не заплановано
                </p>
                <p className="mt-1 text-[13px] text-[color:var(--text-muted)]">
                  Створи щось нове на цей день.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
