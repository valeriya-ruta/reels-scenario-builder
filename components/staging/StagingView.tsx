'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, PenLine, Trash2, Check, ChevronDown } from 'lucide-react';
import DateSheet from '@/components/content/DateSheet';
import ContentTypeIcon from '@/components/ContentTypeIcon';
import ProposingEmptyState from '@/components/propose/ProposingEmptyState';
import TapButton from '@/components/ui/TapButton';
import { setContentScheduledDate, deleteContentPiece } from '@/app/content-actions';
import { contentHref, type ContentPiece } from '@/lib/content/contentPiece';
import { TYPE_LABELS, STATUS_LABELS, STATUS_COLORS } from '@/lib/content/statusSystem';
import {
  sortByPressure,
  stagedAgeDays,
  staleness,
  stagingPressure,
  NUDGE_AFTER_DAYS,
} from '@/lib/content/staging';
import type { ContentType as BraindumpType } from '@/lib/contentTypes';

/**
 * Розбір — the ONE staging surface (Part 4).
 *
 * Modelled on Todoist's Inbox: a place designed to be emptied, with a visible
 * count acting as pressure. Deliberately NOT a library and NOT an archive —
 * there is no "leave it here" state and no neutral storage affordance.
 *
 * Every item has exactly three exits, always visible, never hidden behind a
 * swipe: schedule it, finish it, or consciously kill it (red — the only place
 * red appears here). Tapping an item never re-opens it into limbo; each of the
 * three moves it out of staging.
 */

const TYPE_TO_ICON: Record<string, BraindumpType> = {
  reel: 'reels',
  carousel: 'carousel',
  story: 'stories',
};

const STALENESS_STYLE: Record<string, { border: string; tint: string }> = {
  fresh: { border: 'var(--border)', tint: 'transparent' },
  aging: { border: 'rgba(217,119,38,0.35)', tint: 'rgba(217,119,38,0.05)' },
  stale: { border: 'rgba(217,119,38,0.6)', tint: 'rgba(217,119,38,0.09)' },
};

export default function StagingView({
  pieces: initial,
  nowIso,
}: {
  pieces: ContentPiece[];
  /** Server-stamped "now" so aging is computed once, consistently. */
  nowIso: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ContentPiece[]>(() => sortByPressure(initial));
  const [dateFor, setDateFor] = useState<ContentPiece | null>(null);
  const [killing, setKilling] = useState<string | null>(null);
  // Which item is expanded for reading. One at a time: the pile is worked top
  // down, and two open cards make the count harder to read.
  const [openId, setOpenId] = useState<string | null>(null);

  const needingDecision = useMemo(
    () => items.filter((p) => stagedAgeDays(p, nowIso) >= NUDGE_AFTER_DAYS).length,
    [items, nowIso],
  );

  /** Exit 1 — Schedule. The piece leaves staging for a real day. */
  const schedule = useCallback((piece: ContentPiece, date: string | null) => {
    if (!date) return; // clearing a date inside staging would be a no-op loop
    setItems((cur) => cur.filter((p) => p.id !== piece.id));
    void setContentScheduledDate(piece.refTable, piece.id, date);
  }, []);

  /** Exit 2 — Finish now. Open it and complete it. */
  const finish = useCallback(
    (piece: ContentPiece) => {
      router.push(contentHref(piece));
    },
    [router],
  );

  /**
   * Exit 3 — Kill. A conscious two-tap delete, red, with no undo toast: the
   * point of this surface is that letting go is a real, deliberate decision
   * rather than something that quietly happens by neglect.
   */
  const kill = useCallback(
    (piece: ContentPiece) => {
      if (killing !== piece.id) {
        setKilling(piece.id);
        window.setTimeout(() => setKilling((id) => (id === piece.id ? null : id)), 3000);
        return;
      }
      setKilling(null);
      setItems((cur) => cur.filter((p) => p.id !== piece.id));
      void deleteContentPiece(piece.refTable, piece.id);
    },
    [killing],
  );

  return (
    <div className="app-canvas">
      <div className="app-page">
        <div className="px-0.5">
          <div className="flex items-baseline gap-2">
            <h1 className="app-title">Розбір</h1>
            {items.length > 0 ? (
              <span
                data-testid="staging-count"
                className="rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-[12px] font-bold tabular-nums text-white"
              >
                {items.length}
              </span>
            ) : null}
          </div>
          <p className="app-subtitle">
            {items.length === 0
              ? 'Порожньо — саме так і має бути.'
              : 'Це місце треба спорожнити: дата, доробити або відпустити.'}
          </p>
        </div>

        {needingDecision > 0 ? (
          <div
            data-testid="staging-nudge"
            className="mt-4 rounded-[14px] border px-4 py-3 text-[13px] leading-snug"
            style={{
              borderColor: 'rgba(217,119,38,0.45)',
              backgroundColor: 'rgba(217,119,38,0.07)',
              color: 'var(--foreground)',
            }}
          >
            ✻ {needingDecision === 1 ? 'Одна річ лежить' : `${needingDecision} речі лежать`} тут
            понад {NUDGE_AFTER_DAYS} днів. Ставимо дату — чи відпускаємо?
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="mt-6">
            <ProposingEmptyState
              headline="Тут порожньо — і це добре"
              sub="Нічого не зависло. Якщо хочеш зробити щось нове — ось напрямки."
              limit={2}
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-2.5" data-testid="staging-list">
            {items.map((piece) => {
              const age = stagedAgeDays(piece, nowIso);
              const level = staleness(age);
              const style = STALENESS_STYLE[level];
              const armed = killing === piece.id;
              const isOpen = openId === piece.id;
              return (
                <li
                  key={piece.id}
                  data-testid="staging-item"
                  data-staleness={level}
                  className="rounded-[16px] border p-3.5"
                  style={{
                    borderColor: style.border,
                    backgroundColor: style.tint === 'transparent' ? 'var(--background)' : style.tint,
                    boxShadow: 'var(--elev-1)',
                  }}
                >
                  {/* COLLAPSED: clean. Reading must not require committing, so
                      a tap only EXPANDS — it never opens the editor (§5). The
                      old row carried all three exits at all times, which read as
                      busy and forced "work on it" just to see what a thing was. */}
                  <TapButton
                    onTap={() => setOpenId((cur) => (cur === piece.id ? null : piece.id))}
                    data-testid="staging-expand"
                    aria-expanded={isOpen}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    <ContentTypeIcon type={TYPE_TO_ICON[piece.type] ?? 'reels'} size={16} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[15px] font-semibold tracking-tight text-[color:var(--foreground)] ${
                          isOpen ? '' : 'truncate'
                        }`}
                      >
                        {piece.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                        <span className="font-medium" style={{ color: STATUS_COLORS[piece.status] }}>
                          {STATUS_LABELS[piece.status]}
                        </span>
                        <span aria-hidden>·</span>
                        <span className="text-[color:var(--text-muted)]">
                          {TYPE_LABELS[piece.type]}
                        </span>
                        <span aria-hidden>·</span>
                        {/* Aging is always shown — there is no neutral "stored". */}
                        <span
                          data-testid="staging-pressure"
                          className="font-medium"
                          style={{ color: level === 'fresh' ? 'var(--text-muted)' : '#b45309' }}
                        >
                          {stagingPressure(age)}
                        </span>
                      </span>
                    </span>
                    <ChevronDown
                      className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--text-muted)] transition-transform"
                      style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}
                      aria-hidden
                    />
                  </TapButton>

                  {/* EXPANDED: enough to recognise and decide — the piece's own
                      opening words, then the three exits. Fully non-committal:
                      nothing here changes the piece until one is tapped. */}
                  {isOpen ? (
                    <div data-testid="staging-detail">
                      {piece.preview?.lead ? (
                        <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--foreground)]">
                          {piece.preview.lead}
                        </p>
                      ) : (
                        <p className="mt-3 text-[13px] italic leading-relaxed text-[color:var(--text-muted)]">
                          Тут ще нічого не написано.
                        </p>
                      )}
                      {piece.preview?.countLabel ? (
                        <p className="mt-1.5 text-[11.5px] text-[color:var(--text-muted)]">
                          {piece.preview.countLabel}
                        </p>
                      ) : null}

                      {/* The three exits live HERE, not on every collapsed row. */}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDateFor(piece)}
                          data-testid="staging-schedule"
                          className="app-pill flex-1 justify-center py-2 text-[12.5px]"
                        >
                          <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
                          Запланувати
                        </button>
                        <button
                          type="button"
                          onClick={() => finish(piece)}
                          data-testid="staging-finish"
                          className="app-pill flex-1 justify-center py-2 text-[12.5px]"
                        >
                          <PenLine className="h-3.5 w-3.5" strokeWidth={2} />
                          Доробити
                        </button>
                        <button
                          type="button"
                          onClick={() => kill(piece)}
                          data-testid="staging-kill"
                          data-armed={armed ? 'true' : 'false'}
                          aria-label={armed ? 'Точно відпустити?' : 'Відпустити'}
                          title={armed ? 'Точно?' : 'Відпустити'}
                          className="app-icon-btn shrink-0"
                          style={
                            armed
                              ? { color: '#fff', backgroundColor: '#dc2626', borderColor: '#dc2626' }
                              : { color: '#dc2626' }
                          }
                        >
                          {armed ? (
                            <Check className="h-4 w-4" strokeWidth={2.4} />
                          ) : (
                            <Trash2 className="h-4 w-4" strokeWidth={2} />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DateSheet
        open={dateFor !== null}
        onClose={() => setDateFor(null)}
        value={null}
        onPick={(date) => {
          if (dateFor) schedule(dateFor, date);
        }}
      />
    </div>
  );
}
