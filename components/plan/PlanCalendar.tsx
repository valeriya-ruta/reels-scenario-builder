'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ContentRows from '@/components/content/ContentRows';
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
    <div className="mx-auto w-full max-w-md px-4 pb-24 pt-6">
      {/* Header: Month YYYY + arrows */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-[color:var(--foreground)]">
          {monthLabel(view.year, view.month0)}
        </h1>
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

      {/* Weekday header */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
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

      {/* Detail panel */}
      <div className="mt-6" data-testid="cal-detail">
        {!selected ? (
          <p className="px-2 py-10 text-center text-sm text-zinc-400">
            Обери дату, щоб побачити деталі.
          </p>
        ) : (
          <div>
            <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {dayHeaderLabel(selected)}
            </h2>
            {dayPieces.length > 0 ? (
              <ContentRows pieces={dayPieces} />
            ) : (
              <p className="px-2 py-8 text-center text-sm text-zinc-400">
                Нічого не заплановано.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
