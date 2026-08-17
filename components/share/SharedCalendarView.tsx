'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  monthGrid,
  monthLabel,
  shiftMonth,
  dateKey,
  dayHeaderLabel,
  WEEKDAY_LABELS,
} from '@/lib/content/calendar';
import { STATUS_COLORS, STATUS_LABELS, TYPE_LABELS, TYPE_CHIP_COLORS } from '@/lib/content/statusSystem';
import { displayTitle } from '@/lib/content/displayTitle';
import type { SharedPiece, SharedPieceDetail } from '@/lib/calendar/sharedCalendar';

/**
 * The client's view of a shared content calendar (no login, read-only).
 *
 * Three surfaces, in the order the client actually uses them:
 *   month  → tap a day
 *   day    → the list of what is planned on it
 *   piece  → the whole thing, written out
 *
 * Read-only is structural, not styling: there is no status ring, no date chip,
 * no drag — the client is looking at a plan, not editing one. The detail is
 * fetched per piece (one token-checked call) instead of shipping every scene and
 * slide of the whole month to the browser up front.
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
      className="mb-2.5 flex w-full cursor-pointer items-start gap-3 rounded-[16px] border bg-[color:var(--background)] p-3.5 text-left transition-colors"
      style={{
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        boxShadow: selected ? '0 0 0 1px var(--accent)' : 'var(--elev-1)',
      }}
    >
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[piece.status] }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[15px] font-semibold leading-snug text-[color:var(--foreground)]">
          {title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium">
          <span style={{ color: TYPE_CHIP_COLORS[piece.type] }}>{TYPE_LABELS[piece.type]}</span>
          <span className="text-[color:var(--text-muted)]">·</span>
          <span className="text-[color:var(--text-muted)]">{STATUS_LABELS[piece.status]}</span>
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

function DetailBody({
  detail,
  loading,
  error,
}: {
  detail: SharedPieceDetail | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <p className="px-1 py-8 text-center text-[13px] text-[color:var(--text-muted)]">Відкриваю…</p>
    );
  }
  if (error) {
    return <p className="px-1 py-8 text-center text-[13px] text-red-600">{error}</p>;
  }
  if (!detail) return null;

  const title = displayTitle(detail.title, detail.type);
  return (
    <div data-testid="shared-detail">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
        {TYPE_LABELS[detail.type]}
        {detail.scheduledDate ? ` · ${dayHeaderLabel(detail.scheduledDate)}` : ''}
      </p>
      <h2 className="mt-1 break-words text-[20px] font-bold leading-tight tracking-tight text-[color:var(--foreground)]">
        {title}
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
          style={{
            backgroundColor: `${STATUS_COLORS[detail.status]}1A`,
            color: STATUS_COLORS[detail.status],
          }}
        >
          {STATUS_LABELS[detail.status]}
        </span>
        <span className="text-[12px] font-medium text-[color:var(--text-muted)]">
          {detail.countLabel}
        </span>
      </div>

      {detail.blocks.length === 0 ? (
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

  const [view, setView] = useState(() => ({ year: now.getFullYear(), month0: now.getMonth() }));
  const [selectedDay, setSelectedDay] = useState<string | null>(todayKey);
  const [openPiece, setOpenPiece] = useState<SharedPiece | null>(null);
  const [detail, setDetail] = useState<SharedPieceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, SharedPiece[]>();
    for (const piece of pieces) {
      const arr = map.get(piece.scheduledDate);
      if (arr) arr.push(piece);
      else map.set(piece.scheduledDate, [piece]);
    }
    return map;
  }, [pieces]);

  const cells = useMemo(
    () => monthGrid(view.year, view.month0, todayKey),
    [view.year, view.month0, todayKey],
  );
  const dayPieces = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  const open = useCallback(
    (piece: SharedPiece) => {
      setOpenPiece(piece);
      setDetail(null);
      setError(null);
      setLoading(true);
      void fetch('/api/share/calendar/detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, refTable: piece.refTable, id: piece.id }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('failed');
          const json = (await res.json()) as { detail: SharedPieceDetail };
          setDetail(json.detail);
        })
        .catch(() => setError('Не вдалося відкрити цей контент.'))
        .finally(() => setLoading(false));
    },
    [token],
  );

  // Escape closes the mobile detail sheet — the same gesture every sheet honours.
  useEffect(() => {
    if (!openPiece) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPiece(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openPiece]);

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
                        onClick={() => {
                          setSelectedDay(cell.key);
                          setOpenPiece(null);
                        }}
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
                    onOpen={() => open(piece)}
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
                <DetailBody detail={detail} loading={loading} error={error} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: the same detail as a full-height sheet. */}
      {openPiece && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="flex-1 cursor-default"
            aria-label="Закрити"
            onClick={() => setOpenPiece(null)}
          />
          <div
            className="max-h-[88dvh] overflow-y-auto rounded-t-[22px] bg-[color:var(--background)] px-4 pb-10 pt-4"
            style={{ boxShadow: '0 -8px 40px rgba(16,17,33,0.24)' }}
          >
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setOpenPiece(null)}
                aria-label="Закрити"
                className="app-icon-btn"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
            <DetailBody detail={detail} loading={loading} error={error} />
          </div>
        </div>
      )}
    </div>
  );
}
