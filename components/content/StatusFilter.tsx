'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import {
  CONTENT_STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
  type ContentStatus,
} from '@/lib/content/statusSystem';

/**
 * Status filter (Status system 7/8 — task 86d3btmu2): a "Фільтр" checkbox
 * multiselect (all 7 statuses) + a "Усі" reset pill + active filters as
 * removable chips trailing to the right. OR semantics; live updates.
 */
export default function StatusFilter({
  selected,
  onToggle,
  onClear,
}: {
  selected: ContentStatus[];
  onToggle: (status: ContentStatus) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selectedSet = new Set(selected);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="status-filter">
      {/* Усі — reset pill (active when nothing is selected). */}
      <button
        type="button"
        onClick={onClear}
        className={[
          'rounded-full px-3 py-1.5 text-sm font-medium transition',
          selected.length === 0
            ? 'bg-[color:var(--foreground)] text-[color:var(--background)]'
            : 'bg-[color:var(--surface)] text-zinc-600 hover:bg-zinc-200',
        ].join(' ')}
      >
        Усі
      </button>

      {/* Фільтр dropdown — checkbox multiselect. */}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-full border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium text-[color:var(--foreground)] hover:bg-[color:var(--surface)]"
        >
          Фільтр
          {selected.length > 0 ? (
            <span className="ml-0.5 rounded-full bg-[color:var(--foreground)] px-1.5 text-xs text-[color:var(--background)]">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown size={15} className={open ? 'rotate-180 transition' : 'transition'} />
        </button>

        {open ? (
          <div className="absolute left-0 z-30 mt-2 w-56 rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] p-1.5 shadow-xl">
            {CONTENT_STATUSES.map((status) => {
              const checked = selectedSet.has(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => onToggle(status)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[color:var(--surface)]"
                >
                  <span
                    className={[
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      checked ? 'border-transparent' : 'border-zinc-300',
                    ].join(' ')}
                    style={checked ? { backgroundColor: STATUS_COLORS[status] } : undefined}
                  >
                    {checked ? <Check size={12} className="text-white" /> : null}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                  />
                  <span className="text-sm text-[color:var(--foreground)]">{STATUS_LABELS[status]}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Active filters → removable chips, trailing right. */}
      {selected.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onToggle(status)}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ color: STATUS_COLORS[status], backgroundColor: `${STATUS_COLORS[status]}1F` }}
          aria-label={`Прибрати фільтр ${STATUS_LABELS[status]}`}
        >
          {STATUS_LABELS[status]}
          <X size={13} />
        </button>
      ))}
    </div>
  );
}
