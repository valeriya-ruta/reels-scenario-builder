'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
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
 * Status control (app UI system). A clean outlined pill (Linear / Superlist
 * style) that opens a bottom-sheet picker (monday / Linear) listing the piece's
 * whole track — pick any stage, forward or back, with the current one checked.
 * Optimistic with rollback.
 */
export default function StatusPill({
  refTable,
  id,
  type,
  initialStatus,
  size = 'sm',
}: {
  refTable: ContentPiece['refTable'];
  id: string;
  type: ContentType;
  initialStatus: ContentStatus;
  size?: 'sm' | 'md';
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
  const pad = size === 'md' ? 'px-3 py-1.5 text-[13px]' : 'px-2.5 py-1 text-xs';

  return (
    <>
      <button
        type="button"
        data-testid="status-pill"
        data-status={status}
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface2)] font-medium text-zinc-700 transition-colors hover:bg-zinc-100 ${pad}`}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color }} />
        {STATUS_LABELS[status]}
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Статус">
        <div className="flex flex-col">
          {track.map((s) => {
            const active = s === status;
            return (
              <button
                key={s}
                type="button"
                data-testid={`status-option-${s}`}
                onClick={() => choose(s)}
                className="flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-zinc-100"
              >
                <span
                  style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: STATUS_COLORS[s] }}
                />
                <span className="flex-1 text-[15px] font-medium text-[color:var(--foreground)]">
                  {STATUS_LABELS[s]}
                </span>
                {active ? <Check className="h-5 w-5 text-[color:var(--accent)]" /> : null}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
