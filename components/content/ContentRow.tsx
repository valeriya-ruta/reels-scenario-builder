'use client';

import { type CSSProperties } from 'react';
import StatusRing from '@/components/content/StatusRing';
import { formatRelativeTime } from '@/lib/content/relativeTime';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  TYPE_CHIP_COLORS,
  TYPE_LABELS,
  type ContentStatus,
  type ContentType,
} from '@/lib/content/statusSystem';

/**
 * Content row (Status system 3/8 — task 86d3btmeg). Used by both the Home
 * recents and the full "Твій контент" list.
 *
 * Layout (left → right): pie-fill ring · bold name (ellipsis) · subline
 * [status label in status colour] · [colored type chip] · [time].
 *
 * Presentational: interactions (tap-ring advance, long-press picker, tap-open)
 * are wired by the interactions task; this component just exposes the handlers.
 */
export type ContentRowPiece = {
  id: string;
  type: ContentType;
  status: ContentStatus;
  title: string;
  updatedAt: string | number | Date;
};

function TypeChip({ type }: { type: ContentType }) {
  const color = TYPE_CHIP_COLORS[type];
  const style: CSSProperties = {
    color,
    backgroundColor: `${color}1F`, // ~12% tint
  };
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={style}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

export default function ContentRow({
  piece,
  onOpen,
  onRingClick,
  onLongPress,
}: {
  piece: ContentRowPiece;
  onOpen?: (piece: ContentRowPiece) => void;
  onRingClick?: (piece: ContentRowPiece) => void;
  onLongPress?: (piece: ContentRowPiece) => void;
}) {
  return (
    <div
      className="flex w-full items-center gap-3 border-b border-[color:var(--border)] px-1 py-3 text-left"
      data-content-id={piece.id}
    >
      {/* Leading status ring — its own hit target (tap = advance). */}
      <button
        type="button"
        aria-label="Змінити статус"
        onClick={(e) => {
          e.stopPropagation();
          onRingClick?.(piece);
        }}
        className="shrink-0 rounded-full p-0.5 transition active:scale-95"
      >
        <StatusRing type={piece.type} status={piece.status} size={30} />
      </button>

      {/* Name + subline — tapping opens the piece; long-press opens the picker. */}
      <button
        type="button"
        onClick={() => onOpen?.(piece)}
        onContextMenu={(e) => {
          e.preventDefault();
          onLongPress?.(piece);
        }}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate text-[15px] font-semibold text-[color:var(--foreground)]">
          {piece.title || 'Без назви'}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-zinc-500">
          <span className="shrink-0 font-medium" style={{ color: STATUS_COLORS[piece.status] }}>
            {STATUS_LABELS[piece.status]}
          </span>
          <span aria-hidden="true">·</span>
          <TypeChip type={piece.type} />
          <span aria-hidden="true">·</span>
          <span className="shrink-0 whitespace-nowrap">{formatRelativeTime(piece.updatedAt)}</span>
        </div>
      </button>
    </div>
  );
}
