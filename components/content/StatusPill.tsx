'use client';

import { useState } from 'react';
import { setContentStatus } from '@/app/content-actions';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  nextStatus,
  type ContentStatus,
  type ContentType,
} from '@/lib/content/statusSystem';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * Compact status control for a content editor header (task 86d3d23nj UI pass).
 * Shows the piece's current status as a coloured-dot pill; tapping advances it
 * one stage along its type's track (same ring-tap-advance model as the lists),
 * optimistic with rollback. Lets status be changed while editing, not only from
 * the list.
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
  const [saving, setSaving] = useState(false);

  const advance = async () => {
    const next = nextStatus(type, status);
    if (!next || saving) return;
    const prev = status;
    setStatus(next);
    setSaving(true);
    const res = await setContentStatus(refTable, id, type, next);
    setSaving(false);
    if (!res.ok) setStatus(prev);
  };

  const color = STATUS_COLORS[status] ?? '#9A9A9A';

  return (
    <button
      type="button"
      data-testid="status-pill"
      data-status={status}
      onClick={advance}
      disabled={saving}
      title="Натисни, щоб перевести на наступний етап"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface2)] px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60"
    >
      <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color }} />
      {STATUS_LABELS[status]}
    </button>
  );
}
