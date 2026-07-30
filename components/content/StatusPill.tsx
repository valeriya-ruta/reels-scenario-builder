'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { setContentStatus } from '@/app/content-actions';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  trackFor,
  type ContentStatus,
  type ContentType,
} from '@/lib/content/statusSystem';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Status control for a content editor header (task 86d3d23nj UI pass). Tapping
 * opens a dropdown of the piece's whole track, so any stage can be picked —
 * forward OR back (fixes the "one accidental tap and there's no way back" of the
 * advance-only model). Optimistic with rollback.
 */
export default function StatusPill({
  refTable,
  id,
  type,
  initialStatus,
}: {
  refTable: ContentPiece['refTable'];
  id: string;
  type: ContentType;
  initialStatus: ContentStatus;
}) {
  const [status, setStatus] = useState<ContentStatus>(initialStatus);
  const [open, setOpen] = useState(false);
  const track = trackFor(type);

  const choose = async (next: ContentStatus) => {
    setOpen(false);
    if (next === status) return;
    const prev = status;
    setStatus(next);
    const res = await setContentStatus(refTable, id, type, next);
    if (!res.ok) setStatus(prev);
  };

  const color = STATUS_COLORS[status] ?? '#9A9A9A';

  return (
    <div className="relative inline-block shrink-0">
      <button
        type="button"
        data-testid="status-pill"
        data-status={status}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface2)] px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color }} />
        {STATUS_LABELS[status]}
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            data-testid="status-menu"
            className="absolute left-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] p-1 shadow-lg"
          >
            {track.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={s === status}
                data-testid={`status-option-${s}`}
                onClick={() => choose(s)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
              >
                <span
                  style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: STATUS_COLORS[s] }}
                />
                <span className="flex-1">{STATUS_LABELS[s]}</span>
                {s === status && <Check className="h-4 w-4 text-zinc-500" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
