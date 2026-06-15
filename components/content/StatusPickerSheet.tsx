'use client';

import { Check } from 'lucide-react';
import BlurScrim from '@/components/BlurScrim';
import {
  CONTENT_STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
  isValidStatus,
  type ContentStatus,
  type ContentType,
} from '@/lib/content/statusSystem';

/**
 * Status picker sheet (Status system 4/8 — task 86d3btmh7). Rise-from-bottom,
 * blur-overlay language. Shows ALL 7 statuses; those not valid for the piece's
 * type are greyed + non-selectable. Current status is highlighted with a check.
 */
export default function StatusPickerSheet({
  type,
  current,
  title,
  onSelect,
  onClose,
}: {
  type: ContentType;
  current: ContentStatus;
  title?: string;
  onSelect: (status: ContentStatus) => void;
  onClose: () => void;
}) {
  return (
    <BlurScrim onScrimClick={onClose} zIndex={70}>
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div
          role="dialog"
          aria-label="Вибери статус"
          className="w-full max-w-md rounded-t-3xl bg-[color:var(--background)] p-4 pb-8 shadow-2xl"
          style={{ animation: 'sheet-rise 220ms cubic-bezier(0.16,1,0.3,1)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300" />
          <p className="mb-1 px-1 text-center text-sm font-semibold text-[color:var(--foreground)]">
            Статус
          </p>
          {title ? (
            <p className="mb-3 truncate px-1 text-center text-xs text-zinc-500">{title}</p>
          ) : null}

          <div className="flex flex-col">
            {CONTENT_STATUSES.map((status) => {
              const valid = isValidStatus(type, status);
              const isCurrent = status === current;
              return (
                <button
                  key={status}
                  type="button"
                  disabled={!valid}
                  onClick={() => valid && onSelect(status)}
                  className={[
                    'flex items-center gap-3 rounded-xl px-3 py-3 text-left transition',
                    valid ? 'hover:bg-[color:var(--surface)] active:scale-[0.99]' : 'cursor-not-allowed opacity-35',
                    isCurrent ? 'bg-[color:var(--surface)]' : '',
                  ].join(' ')}
                  aria-current={isCurrent ? 'true' : undefined}
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                  />
                  <span className="flex-1 text-[15px] font-medium text-[color:var(--foreground)]">
                    {STATUS_LABELS[status]}
                  </span>
                  {isCurrent ? <Check size={18} className="shrink-0 text-zinc-500" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <style>{`@keyframes sheet-rise{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </BlurScrim>
  );
}
