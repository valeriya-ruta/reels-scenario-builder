'use client';

import { CalendarDays, ImageIcon } from 'lucide-react';
import StatusRing from '@/components/content/StatusRing';
import SetChip from '@/components/content/SetChip';
import { dayHeaderLabel } from '@/lib/content/calendar';
import { STATUS_COLORS, STATUS_LABELS, TYPE_LABELS } from '@/lib/content/statusSystem';
import { displayTitle, previewAddsInfo } from '@/lib/content/displayTitle';
import type { ContentPiece } from '@/lib/content/contentPiece';

/**
 * A content piece as an editorial card.
 *
 * §1 — ONE title, never two. The card used to show the name as an eyebrow AND
 * the preview line underneath; for carousels those are the SAME string, because
 * `deriveCarouselNameFromRant` names the project after its first slide's title.
 * So the title is the headline, and the preview line renders only when it
 * actually says something the title doesn't.
 *
 * §2 — title · meta · date share one baseline; the date never drops onto its own
 * line. The type tag is hidden inside a single-type list, where "Карусель" on a
 * carousel is pure noise.
 *
 * §3 — no creation date anywhere. A dated piece shows its date; an undated one
 * shows «Незаплановано». When it was made is not a thing you act on.
 */

/** Mini cover: the carousel's real background + text colours, 4:5 like the post. */
function CoverThumb({ piece, title }: { piece: ContentPiece; title: string }) {
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
        {piece.preview?.lead || title}
      </span>
    </div>
  );
}

export default function ContentCard({
  piece,
  onAdvance,
  hideTypeTag = false,
}: {
  piece: ContentPiece;
  /** Ring tap — advance one stage (the parent owns persistence). */
  onAdvance: () => void;
  /** True inside a single-type list, where the type tag is noise (§2). */
  hideTypeTag?: boolean;
}) {
  const preview = piece.preview;
  const title = displayTitle(piece.title, piece.type);
  // Only render the preview line when it adds something the title doesn't.
  const sub = previewAddsInfo(piece.title, preview?.lead) ? preview?.lead : null;
  // A reel is judged by LENGTH; everything else by size (§3).
  const sizeLabel =
    piece.type === 'reel' ? preview?.durationLabel ?? preview?.countLabel : preview?.countLabel;

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
        {/* THE title. Exactly one. */}
        <div className="flex items-center">
          <p
            className="min-w-0 flex-1 truncate text-[15.5px] font-semibold leading-snug tracking-tight text-[color:var(--foreground)]"
            data-testid="content-card-title"
          >
            {title}
          </p>
          <SetChip piece={piece} />
        </div>

        {sub ? (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[color:var(--text-secondary)]">
            {sub}
          </p>
        ) : null}

        {/* One baseline: status · type · count …… date. `flex-nowrap` + a
            min-w-0 truncating group is what keeps the date pill from wrapping
            onto its own line (§2). */}
        <div className="mt-1.5 flex flex-nowrap items-center gap-1.5 text-[12px]">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium" style={{ color: STATUS_COLORS[piece.status] }}>
              {STATUS_LABELS[piece.status]}
            </span>
            {/* Exactly ONE fact after the status, so the line always fits beside
                the date instead of truncating to "8 …". In a mixed list the type
                is what disambiguates; inside a single-type list the type is
                noise (§2) and the size/length is the useful thing. */}
            {!hideTypeTag ? (
              <span className="text-[color:var(--text-muted)]"> · {TYPE_LABELS[piece.type]}</span>
            ) : sizeLabel ? (
              <span className="text-[color:var(--text-muted)]"> · {sizeLabel}</span>
            ) : null}
          </span>

          {piece.scheduledDate ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[color:var(--surface1)] px-2 py-0.5 text-[11px] font-medium text-zinc-500"
              title="Заплановано"
              data-testid="content-card-date"
            >
              <CalendarDays className="h-3 w-3" aria-hidden />
              {dayHeaderLabel(piece.scheduledDate)}
            </span>
          ) : (
            <span
              className="shrink-0 whitespace-nowrap text-[11px] font-medium text-[color:var(--text-muted)]"
              data-testid="content-card-unscheduled"
            >
              Незаплановано
            </span>
          )}
        </div>
      </div>

      <CoverThumb piece={piece} title={title} />
    </div>
  );
}
