'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import DateSheet from '@/components/content/DateSheet';
import { setContentScheduledDate } from '@/app/content-actions';
import type { ContentPiece } from '@/lib/content/contentPiece';
import { dayHeaderLabel } from '@/lib/content/calendar';

/**
 * Date / schedule control (app UI system). A clean outlined pill (Linear /
 * Superlist style) showing «Запланувати» when empty and the date (e.g. "23 БЕР")
 * once set. Tapping opens a calendar bottom sheet (DateSheet) — consistent with
 * the План calendar rather than the raw OS picker. Optimistic with rollback.
 */
export default function ScheduleChip({
  refTable,
  id,
  initialDate,
  size = 'sm',
}: {
  refTable: ContentPiece['refTable'];
  id: string;
  initialDate: string | null;
  size?: 'sm' | 'md';
}) {
  const [date, setDate] = useState<string | null>(initialDate);
  const [open, setOpen] = useState(false);

  const onPick = async (next: string | null) => {
    const prev = date;
    setDate(next);
    const res = await setContentScheduledDate(refTable, id, next);
    if (!res.ok) setDate(prev);
  };

  const pad = size === 'md' ? 'px-3 py-1.5 text-[13px]' : 'px-2.5 py-1 text-xs';

  return (
    <>
      <button
        type="button"
        data-testid="schedule-chip"
        data-scheduled={date ? 'true' : 'false'}
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface2)] font-medium text-zinc-700 transition-colors hover:bg-zinc-100 ${pad}`}
      >
        <CalendarDays className="h-3.5 w-3.5 text-zinc-500" />
        {date ? dayHeaderLabel(date) : 'Запланувати'}
      </button>

      <DateSheet open={open} onClose={() => setOpen(false)} value={date} onPick={onPick} />
    </>
  );
}
