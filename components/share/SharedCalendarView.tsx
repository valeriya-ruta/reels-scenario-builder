'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import PieceDetail from '@/components/share/PieceDetail';
import {
  monthGrid,
  monthLabel,
  shiftMonth,
  dateKey,
  dayHeaderLabel,
  WEEKDAY_LABELS,
} from '@/lib/content/calendar';
import { TYPE_LABELS, TYPE_CHIP_COLORS } from '@/lib/content/statusSystem';
import { displayTitle } from '@/lib/content/displayTitle';
import type { SharedPiece, SharedPieceDetail } from '@/lib/calendar/sharedCalendar';

/**
 * The client's view of a shared content calendar (no login, read-only).
 *
 * Three surfaces, in the order the client actually uses them:
 *   month  → pick a day
 *   day    → the list of what is planned on it
 *   piece  → the whole thing, written out
 *
 * The day's FIRST piece opens by itself, so the detail column is never an empty
 * panel waiting to be clicked — on a day with content there is always something
 * to read. It opens only into the desktop column, never into the phone's sheet:
 * auto-opening a full-height sheet would drop a modal over the calendar the
 * moment the page loaded. On a phone the list is already the content, and a tap
 * raises the sheet.
 *
 * Read-only is structural, not styling: no status, no date chip, no drag — the
 * client is looking at a plan, not managing one. The detail is fetched per piece
 * (one token-checked call) instead of shipping every scene and slide of the
 * whole month to the browser up front.
 */

function PieceCard({
  piece,
  selected,
  onOpen,
}: {
  piece: SharedPiece;
  selected: boolean;
  onOpen: () => void;
}) {
  const title = displayTitle(piece.title, piece.type);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="shared-piece"
      data-piece-id={piece.id}
      className="mb-2.5 flex w-full cursor-pointer items-start rounded-[16px] border bg-[color:var(--background)] p-3.5 text-left transition-colors"
      style={{
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        boxShadow: selected ? '0 0 0 1px var(--accent)' : 'var(--elev-1)',
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[15px] font-semibold leading-snug text-[color:var(--foreground)]">
          {title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium">
          <span style={{ color: TYPE_CHIP_COLORS[piece.type] }}>{TYPE_LABELS[piece.type]}</span>
          {piece.setIndex && piece.setSize ? (
            <>
              <span className="text-[color:var(--text-muted)]">·</span>
              <span className="text-[color:var(--text-muted)] tabular-nums">
                день {piece.setIndex}/{piece.setSize}
              </span>
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}

export default function SharedCalendarView({
  token,
  title,
  note,
  pieces,
}: {
  token: string;
  title: string | null;
  note: string | null;
  pieces: SharedPiece[];
}) {
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const byDay = useMemo(() => {
    const map = new Map<string, SharedPiece[]>();
    for (const piece of pieces) {
      const arr = map.get(piece.scheduledDate);
      if (arr) arr.push(piece);
      else map.set(piece.scheduledDate, [piece]);
    }
    return map;
  }, [pieces]);

  const [view, setView] = useState(() => ({ year: now.getFullYear(), month0: now.getMonth() }));
  const [selectedDay, setSelectedDay] = useState<string | null>(todayKey);
  // Today's first piece is already open on arrival — same rule a day tap applies.
  const [openPiece, setOpenPiece] = useState<SharedPiece | null>(
    () => byDay.get(todayKey)?.[0] ?? null,
  );
  // The phone's sheet is raised only by a real tap, never by the auto-open.
  const [sheetOpen, setSheetOpen] = useState(false);
  // Reading one piece over the whole screen, calendar and all out of the way.
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<SharedPieceDetail | null>(null);
  // Which piece FAILED, rather than a bare message: keyed this way, moving to
  // another piece clears the error by itself and no effect has to reset state.
  const [failedId, setFailedId] = useState<string | null>(null);

  const cells = useMemo(
    () => monthGrid(view.year, view.month0, todayKey),
    [view.year, view.month0, todayKey],
  );
  const dayPieces = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  // Derived, not stored: a piece is "loading" precisely while the detail on hand
  // is not yet its own. One less state to keep in step with the fetch.
  const failed = !!openPiece && failedId === openPiece.id;
  const loading = !!openPiece && !failed && detail?.id !== openPiece.id;

  /** Show a piece in the detail column; `viaTap` also raises the phone's sheet. */
  const open = useCallback((piece: SharedPiece, viaTap: boolean) => {
    setOpenPiece(piece);
    if (viaTap) setSheetOpen(true);
  }, []);

  /** Pick a day, and open what it starts with. */
  const selectDay = useCallback(
    (dayKey: string) => {
      setSelectedDay(dayKey);
      setSheetOpen(false);
      setExpanded(false);
      setOpenPiece(byDay.get(dayKey)?.[0] ?? null);
    },
    [byDay],
  );

  // One fetch per opened piece. Every setState here lands in a promise callback,
  // so nothing writes state synchronously while the effect is running.
  useEffect(() => {
    if (!openPiece) return;
    let cancelled = false;
    const { id, refTable } = openPiece;
    fetch('/api/share/calendar/detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, refTable, id }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('failed');
        const json = (await res.json()) as { detail: SharedPieceDetail };
        if (!cancelled) setDetail(json.detail);
      })
      .catch(() => {
        if (!cancelled) setFailedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [openPiece, token]);

  // Escape backs out one layer: full screen first, then the phone's sheet. It
  // does not clear the selection — the desktop column has nothing to close, it
  // just shows the current piece.
  useEffect(() => {
    if (!sheetOpen && !expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (expanded) setExpanded(false);
      else setSheetOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen, expanded]);

  return (
    <div className="min-h-[100dvh]" style={{ background: 'var(--canvas)' }}>
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-6 md:px-8">
        <header className="mb-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.2} />
            Контент-план
          </p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-[color:var(--foreground)]">
            {title?.trim() || 'Календар контенту'}
          </h1>
          {note?.trim() ? (
            <p className="mt-1.5 max-w-prose whitespace-pre-wrap text-[14px] leading-relaxed text-[color:var(--text-muted)]">
              {note}
            </p>
          ) : null}
        </header>

        {/* Calendar + day list on the left, the opened piece on the right — the
            detail column only exists once something is selected. */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="min-w-0 md:w-[380px] md:shrink-0">
            <div className="app-card px-2 pb-2 pt-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[14px] font-semibold text-[color:var(--foreground)]">
                  {monthLabel(view.year, view.month0)}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Попередній місяць"
                    data-testid="shared-cal-prev"
                    onClick={() => setView((v) => shiftMonth(v.year, v.month0, -1))}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Наступний місяць"
                    data-testid="shared-cal-next"
                    onClick={() => setView((v) => shiftMonth(v.year, v.month0, 1))}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mb-1 grid grid-cols-7 text-center">
                {WEEKDAY_LABELS.map((w) => (
                  <div
                    key={w}
                    className="py-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]"
                  >
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {cells.map((cell) => {
                  const count = byDay.get(cell.key)?.length ?? 0;
                  const isSelected = selectedDay === cell.key;
                  return (
                    <div
                      key={cell.key}
                      className="relative flex aspect-square items-center justify-center"
                    >
                      <button
                        type="button"
                        data-testid="shared-cal-day"
                        data-day={cell.key}
                        data-count={count}
                        onClick={() => selectDay(cell.key)}
                        className="relative flex h-full w-full cursor-pointer items-center justify-center"
                      >
                        <span
                          className="relative flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors"
                          style={{
                            backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                            color: isSelected
                              ? '#fff'
                              : !cell.inMonth
                                ? '#c4c4cc'
                                : cell.isToday
                                  ? 'var(--accent)'
                                  : 'var(--foreground)',
                            fontWeight: cell.isToday || isSelected ? 700 : 400,
                          }}
                        >
                          {cell.day}
                        </span>
                        {count > 0 && (
                          <span
                            className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
                            style={{
                              backgroundColor: isSelected ? '#fff' : 'var(--accent)',
                              color: isSelected ? 'var(--accent)' : '#fff',
                            }}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5" data-testid="shared-day-panel">
              <h2 className="app-section-label mb-2.5 px-0.5">
                {selectedDay ? dayHeaderLabel(selectedDay) : 'Обери дату'}
              </h2>
              {dayPieces.length > 0 ? (
                dayPieces.map((piece) => (
                  <PieceCard
                    key={piece.id}
                    piece={piece}
                    selected={openPiece?.id === piece.id}
                    onOpen={() => open(piece, true)}
                  />
                ))
              ) : (
                <div className="app-card px-6 py-8 text-center">
                  <p className="text-[14px] font-semibold text-[color:var(--foreground)]">
                    Нічого не заплановано
                  </p>
                  <p className="mt-1 text-[13px] text-[color:var(--text-muted)]">
                    Обери інший день у календарі.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Desktop detail column: present only when a piece is open. */}
          {openPiece && (
            <div className="hidden min-w-0 flex-1 md:block">
              <div className="app-card sticky top-6 max-h-[calc(100dvh-48px)] overflow-y-auto p-5">
                <PieceDetail
                  detail={detail}
                  loading={loading}
                  failed={failed}
                  onToggleExpand={() => setExpanded(true)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full screen: the same piece with nothing else on the page. A reel is
          the reason this exists — its storyboard does not fit a phone sheet
          over a month grid, and there is no separate link to send someone to. */}
      {openPiece && expanded && (
        <div
          className="fixed inset-0 z-[60] overflow-y-auto"
          style={{ background: 'var(--canvas)' }}
          role="dialog"
          aria-modal="true"
          data-testid="shared-detail-full"
        >
          <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-5 md:px-8">
            <PieceDetail
              detail={detail}
              loading={loading}
              failed={failed}
              expanded
              onToggleExpand={() => setExpanded(false)}
            />
          </div>
        </div>
      )}

      {/* Mobile: the same detail as a full-height sheet. */}
      {openPiece && sheetOpen && !expanded && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="flex-1 cursor-default"
            aria-label="Закрити"
            onClick={() => setSheetOpen(false)}
          />
          <div
            className="max-h-[88dvh] overflow-y-auto rounded-t-[22px] bg-[color:var(--background)] px-4 pb-10 pt-4"
            style={{ boxShadow: '0 -8px 40px rgba(16,17,33,0.24)' }}
          >
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Закрити"
                className="app-icon-btn"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
            <PieceDetail
              detail={detail}
              loading={loading}
              failed={failed}
              onToggleExpand={() => setExpanded(true)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
