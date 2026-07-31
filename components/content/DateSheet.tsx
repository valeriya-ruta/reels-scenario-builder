'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import { monthGrid, monthLabel, shiftMonth, dateKey, WEEKDAY_LABELS } from '@/lib/content/calendar';

/**
 * Date picker as a calendar bottom sheet (Substack / Reddit / Spotify pattern),
 * reusing the same month grid as the План calendar so scheduling feels native to
 * the app instead of the raw OS date input. Tap a day to set; quick Сьогодні /
 * Завтра; clear removes the date.
 */
export default function DateSheet({
  open,
  onClose,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  value: string | null;
  onPick: (date: string | null) => void;
}) {
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const [view, setView] = useState(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number);
      return { year: y, month0: (m || 1) - 1 };
    }
    return { year: now.getFullYear(), month0: now.getMonth() };
  });

  const cells = monthGrid(view.year, view.month0, todayKey);
  const selected = value ? value.slice(0, 10) : null;

  const pick = (key: string) => {
    onPick(key);
    onClose();
  };
  const tomorrow = () => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    pick(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Запланувати">
      {/* Сьогодні / Завтра pinned to the TOP (§8) — they are the overwhelming
          majority of picks, and having to scan past a month grid to reach them
          made the fastest choice the slowest. Right-aligned so they fall under
          the thumb on a phone. */}
      <div className="mb-3 flex items-center justify-end gap-2">
        {value ? (
          <button
            type="button"
            onClick={() => {
              onPick(null);
              onClose();
            }}
            className="mr-auto rounded-full px-3 py-2 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100"
          >
            Прибрати
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => pick(todayKey)}
          data-testid="datesheet-today"
          className="rounded-full bg-[color:var(--accent-soft)] px-4 py-2 text-[13.5px] font-semibold text-[color:var(--accent)]"
        >
          Сьогодні
        </button>
        <button
          type="button"
          onClick={tomorrow}
          data-testid="datesheet-tomorrow"
          className="rounded-full bg-[color:var(--accent-soft)] px-4 py-2 text-[13.5px] font-semibold text-[color:var(--accent)]"
        >
          Завтра
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[15px] font-semibold text-[color:var(--foreground)]">
          {monthLabel(view.year, view.month0)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Попередній місяць"
            onClick={() => setView((v) => shiftMonth(v.year, v.month0, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Наступний місяць"
            onClick={() => setView((v) => shiftMonth(v.year, v.month0, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const isSelected = selected === cell.key;
          return (
            <button
              key={cell.key}
              type="button"
              data-testid="datesheet-day"
              data-day={cell.key}
              onClick={() => pick(cell.key)}
              className="flex aspect-square items-center justify-center"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors"
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
            </button>
          );
        })}
      </div>

    </BottomSheet>
  );
}
