'use client';

import { CalendarDays, ImageIcon } from 'lucide-react';
import StatusRing from '@/components/content/StatusRing';
import SetChip from '@/components/content/SetChip';
import { dayHeaderLabel } from '@/lib/content/calendar';
import { STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from '@/lib/content/statusSystem';
import { formatRelativeTime } from '@/lib/content/relativeTime';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * A content piece as an editorial card — the piece previewing what it will
 * BECOME, not a database row with a title and a status pill.
 *
 * • carousel — its actual cover slide, in its actual palette
 * • story    — its opening line, in real type
 * • reel     — its hook
 *
 * The title drops to a small eyebrow above the content, because the content is
 * the thing the user recognises; a name like "Без назви" tells them nothing.
 * When a piece has no body yet the card degrades to the title as the lead, so
 * an empty draft still reads as itself.
 */

/** Mini cover: the carousel's real background + text colours, 4:5 like the post. */
function CoverThumb({ piece }: { piece: ContentPiece }) {
  const cover = piece.preview?.cover;
  if (!cover) return null;
  return (
    <div
      className="relative flex h-[68px] w-[54px] shrink-0 flex-col justify-center overflow-hidden rounded-[8px] px-1.5"
      style={{ backgroundColor: cover.background }}
      aria-hidden
    >
      {cover.hasPhoto ? (
        <ImageIcon
          className="absolute right-1 top-1 h-3 w-3 opacity-50"
          style={{ color: cover.titleColor }}
        />
      ) : null}
      <span
        className="line-clamp-4 text-[6.5px] font-bold leading-[1.25] tracking-tight"
        style={{ color: cover.titleColor }}
      >
        {piece.preview?.lead}
      </span>
    </div>
  );
}

export default function ContentCard({
  piece,
  onAdvance,
}: {
  piece: ContentPiece;
  /** Ring tap — advance one stage (the parent owns persistence). */
  onAdvance: () => void;
}) {
  const preview = piece.preview;
  const lead = preview?.lead || piece.title;
  // Only show the name as an eyebrow when the content itself is the headline —
  // otherwise the same string would appear twice.
  const eyebrow = preview?.lead ? piece.title : null;

  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {/* Ring is its own hit target — one tap advances a stage. */}
      <button
        type="button"
        aria-label="Змінити статус"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onAdvance();
        }}
        className="mt-0.5 shrink-0 rounded-full p-0.5 transition active:scale-95"
      >
        <StatusRing type={piece.type} status={piece.status} size={30} />
      </button>

      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <div className="flex items-center">
            <span className="min-w-0 truncate text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              {eyebrow}
            </span>
            <SetChip piece={piece} />
          </div>
        ) : null}

        {/* The content's own words, in real editorial type. */}
        <p
          className="mt-0.5 line-clamp-2 text-[15.5px] font-semibold leading-[1.3] tracking-tight text-[color:var(--foreground)]"
          data-testid="content-card-lead"
        >
          {lead}
        </p>
        {preview?.sub ? (
          <p className="mt-1 line-clamp-1 text-[13px] leading-snug text-[color:var(--text-secondary)]">
            {preview.sub}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
          <span className="shrink-0 font-medium" style={{ color: STATUS_COLORS[piece.status] }}>
            {STATUS_LABELS[piece.status]}
          </span>
          <span aria-hidden>·</span>
          <span className="shrink-0 text-[color:var(--text-muted)]">{TYPE_LABELS[piece.type]}</span>
          {preview?.countLabel ? (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0 text-[color:var(--text-muted)]">{preview.countLabel}</span>
            </>
          ) : null}
          {piece.scheduledDate ? (
            <span
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[color:var(--surface1)] px-2 py-0.5 text-[11px] font-medium text-zinc-500"
              title="Заплановано"
            >
              <CalendarDays className="h-3 w-3" aria-hidden />
              {dayHeaderLabel(piece.scheduledDate)}
            </span>
          ) : (
            <span className="ml-auto shrink-0 text-[11px] text-[color:var(--text-muted)]">
              {formatRelativeTime(piece.updatedAt)}
            </span>
          )}
        </div>
      </div>

      <CoverThumb piece={piece} />
    </div>
  );
}
