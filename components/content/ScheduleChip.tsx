'use client';

import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { setContentScheduledDate } from '@/app/content-actions';
import type { ContentPiece } from '@/lib/content/contentPiece';
import { dayHeaderLabel } from '@/lib/content/calendar';

/**
 * "📅 Запланувати" chip (task 86d3d23nj, entry point 1). Sits in a content
 * editor's header; shows «Запланувати» when unscheduled and the date (e.g.
 * "23 БЕР") once set. Tap opens a plain native date picker (the lean for the
 * open picker-style question) and stamps `scheduled_date` on the piece.
 *
 * NOTE: exact per-editor placement is one of the task's OPEN questions — this is
 * a self-contained chip so it can be dropped wherever Kunj confirms.
 */
export default function ScheduleChip({
  refTable,
  id,
  initialDate,
}: {
  refTable: ContentPiece['refTable'];
  id: string;
  initialDate: string | null;
}) {
  const [date, setDate] = useState<string | null>(initialDate);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    // showPicker() is the native affordance; fall back to focus/click.
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  };

  const onChange = async (value: string) => {
    const next = value || null;
    const prev = date;
    setDate(next);
    setSaving(true);
    const res = await setContentScheduledDate(refTable, id, next);
    setSaving(false);
    if (!res.ok) setDate(prev); // roll back on failure
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        data-testid="schedule-chip"
        data-scheduled={date ? 'true' : 'false'}
        onClick={openPicker}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface2)] px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        {date ? dayHeaderLabel(date) : 'Запланувати'}
      </button>
      {/* Visually-hidden native date input the chip drives. */}
      <input
        ref={inputRef}
        type="date"
        data-testid="schedule-input"
        value={date ?? ''}
        onChange={(e) => void onChange(e.target.value)}
        className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </span>
  );
}
