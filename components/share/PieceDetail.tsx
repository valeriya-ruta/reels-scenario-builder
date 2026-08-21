'use client';

import { Maximize2, Minimize2, SquarePen } from 'lucide-react';
import ReelRecipe from '@/components/reels/ReelRecipe';
import { TYPE_LABELS } from '@/lib/content/statusSystem';
import { displayTitle } from '@/lib/content/displayTitle';
import { dayHeaderLabel } from '@/lib/content/calendar';
import type { SharedPieceDetail } from '@/lib/calendar/sharedCalendar';

/**
 * One piece of content, written out — the panel beside a calendar.
 *
 * Shared by BOTH calendars on purpose. The client's shared link and План show
 * the same document from the same database function (migration 049); rendering
 * it twice would be two chances for one of them to fall behind the model, which
 * is precisely how a reel's clips came to be missing from the shared calendar.
 *
 * The only difference between the two callers is `onOpenEditor`: on her own
 * calendar the panel is a way IN to the piece, on the client's it is the whole
 * of what they get.
 */
export default function PieceDetail({
  detail,
  loading,
  failed,
  expanded,
  onToggleExpand,
  onOpenEditor,
  surface = 'var(--background)',
}: {
  detail: SharedPieceDetail | null;
  loading: boolean;
  failed: boolean;
  /** Whether this is already the full-screen copy. */
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Owner only — open the real editor for this piece. */
  onOpenEditor?: () => void;
  /**
   * What the header paints itself with when it sticks. It has to match the
   * surface it sits on — a card, or the bare page in full screen — because the
   * content scrolls underneath it.
   */
  surface?: string;
}) {
  if (failed) {
    return (
      <p className="px-1 py-8 text-center text-[13px] text-red-600">
        Не вдалося відкрити цей контент.
      </p>
    );
  }
  if (loading || !detail) {
    return (
      <p className="px-1 py-8 text-center text-[13px] text-[color:var(--text-muted)]">Відкриваю…</p>
    );
  }

  const title = displayTitle(detail.title, detail.type);
  const reel = detail.reel;

  return (
    <div data-testid="shared-detail">
      {/* Which piece you are reading, and the two ways out of it, stay put
          while the reel scrolls — a storyboard is long enough that the title
          was gone by the second beat, and with it the edit and full-screen
          buttons.

          The background is painted by a pseudo-element bled 24px past the
          content box, because every surface this renders on has padding
          (a card's 20px, a sheet's 16px) that the header itself does not span —
          without it the text scrolls up through those strips. */}
      <div
        data-testid="detail-head"
        className="sticky top-0 z-10 flex items-start gap-3 pb-2.5 before:absolute before:-inset-x-6 before:-top-6 before:bottom-0 before:-z-10 before:bg-[color:var(--head-bg)] before:content-['']"
        style={{ ['--head-bg' as string]: surface }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            {TYPE_LABELS[detail.type]}
            {detail.scheduledDate ? ` · ${dayHeaderLabel(detail.scheduledDate)}` : ''}
          </p>
          <h2 className="mt-1 break-words text-[20px] font-bold leading-tight tracking-tight text-[color:var(--foreground)]">
            {title}
          </h2>
          <p className="mt-2 text-[12px] font-medium text-[color:var(--text-muted)]">
            {detail.countLabel}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onOpenEditor && (
            <button
              type="button"
              onClick={onOpenEditor}
              data-testid="piece-open-editor"
              aria-label="Редагувати"
              title="Редагувати"
              className="app-icon-btn"
            >
              <SquarePen className="h-4.5 w-4.5" strokeWidth={2} />
            </button>
          )}
          {/* A reel is long — three columns of storyboard, a shot list and the
              script. Reading that in a panel beside a month grid is the
              complaint; this opens the same content over the whole screen. */}
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              data-testid="shared-detail-expand"
              aria-label={expanded ? 'Згорнути' : 'На весь екран'}
              title={expanded ? 'Згорнути' : 'На весь екран'}
              className="app-icon-btn"
            >
              {expanded ? (
                <Minimize2 className="h-4.5 w-4.5" strokeWidth={2} />
              ) : (
                <Maximize2 className="h-4.5 w-4.5" strokeWidth={2} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* The whole reel, rendered by the component the reel share link uses —
          brief and references first, then what happens beat by beat, then what
          has to be shot or found. */}
      {reel ? (
        reel.blocks.length === 0 ? (
          <p className="mt-6 rounded-[16px] border border-dashed border-[color:var(--border)] px-4 py-8 text-center text-[13px] text-[color:var(--text-muted)]">
            Тут ще порожньо.
          </p>
        ) : (
          <div className="mt-4">
            <ReelRecipe
              blocks={reel.blocks}
              reelAudio={reel.audio}
              overview={reel.overview}
              references={reel.references}
            />
          </div>
        )
      ) : detail.blocks.length === 0 ? (
        <p className="mt-6 rounded-[16px] border border-dashed border-[color:var(--border)] px-4 py-8 text-center text-[13px] text-[color:var(--text-muted)]">
          Тут ще порожньо.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {detail.blocks.map((block, i) => (
            <li
              key={i}
              data-testid="shared-detail-block"
              className="rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface1)]/60 p-3.5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                {block.heading}
              </p>
              {block.body ? (
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[color:var(--foreground)]">
                  {block.body}
                </p>
              ) : (
                <p className="mt-1.5 text-[13px] italic text-[color:var(--text-muted)]">
                  Ще не написано
                </p>
              )}
              {block.meta.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[color:var(--text-muted)]">
                  {block.meta.map((m, j) => (
                    <span key={j}>{m}</span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
