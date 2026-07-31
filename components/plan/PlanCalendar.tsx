'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  TouchSensor,
  MouseSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import ContentCard from '@/components/content/ContentCard';
import { setContentScheduledDate } from '@/app/content-actions';
import { STATUS_COLORS } from '@/lib/content/statusSystem';
import {
  useAdvanceContentStatus,
  useLiveStatuses,
} from '@/lib/content/contentStatusStore';
import { contentHref } from '@/lib/content/contentPiece';
import PlanCreateMenu from '@/components/plan/PlanCreateMenu';
import StagingPressureCard from '@/components/staging/StagingPressureCard';
import type { ContentPiece } from '@/lib/content/contentPiece';
import {
  monthGrid,
  monthLabel,
  shiftMonth,
  groupByScheduledDate,
  dayHeaderLabel,
  dateKey,
  WEEKDAY_LABELS,
} from '@/lib/content/calendar';

/**
 * План content calendar (task 86d3d23nj). Minimalist Sun–Sat month grid with a
 * top-right NUMBER BADGE per day (count of scheduled content), subtle accent
 * "today", filled-accent-circle selection, and a detail panel that reuses the
 * real ContentRows card below the grid. Scheduling itself happens elsewhere
 * (schedule chip / swipe date action) — this is the viewing surface.
 */
/** A day cell that accepts a dropped piece. */
function DroppableDay({ dayKey, children }: { dayKey: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayKey}` });
  return (
    <div
      ref={setNodeRef}
      className="relative flex aspect-square items-center justify-center rounded-[10px] transition-colors"
      style={{ backgroundColor: isOver ? 'var(--accent-soft)' : undefined }}
    >
      {children}
    </div>
  );
}

/**
 * A scheduled piece in the day panel (§6).
 *
 * The whole CARD is the drag handle — long-press lifts it, a tap opens it. The
 * old six-dot grip was a second, smaller target for something the card itself
 * should do, and it forced a duplicate list underneath just to host the handles.
 *
 * Tap vs. lift is unambiguous by construction: TouchSensor only arms after a
 * hold, so a scroll or a tap never starts a drag, and dnd-kit lets the click
 * through when no drag began.
 */
function DraggableContentCard({
  piece,
  onOpen,
  onAdvance,
}: {
  piece: ContentPiece;
  onOpen: () => void;
  onAdvance: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `piece:${piece.id}` });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid="cal-day-card"
      data-dragging={isDragging ? 'true' : 'false'}
      onClick={onOpen}
      className="mb-2.5 cursor-grab rounded-[16px] border border-[color:var(--border)] bg-[color:var(--background)] p-3.5 active:cursor-grabbing"
      style={{
        // Lift: shrink under the thumb + a deeper shadow so it reads as held
        // and OFF the page, rather than merely highlighted.
        transform: isDragging ? 'scale(0.96)' : undefined,
        boxShadow: isDragging ? '0 18px 36px rgba(16,17,33,0.24)' : 'var(--elev-1)',
        opacity: isDragging ? 0.92 : 1,
        transition: 'transform 160ms cubic-bezier(0.22,1,0.36,1), box-shadow 160ms ease',
        touchAction: 'pan-y',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      <ContentCard piece={piece} onAdvance={onAdvance} />
    </div>
  );
}

export default function PlanCalendar({
  pieces,
  stagedCount,
  stagedOverdue,
}: {
  pieces: ContentPiece[];
  stagedCount: number;
  stagedOverdue: number;
}) {
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const [view, setView] = useState(() => ({ year: now.getFullYear(), month0: now.getMonth() }));
  const [selected, setSelected] = useState<string | null>(null);

  // Local overrides so a drop moves the piece instantly (optimistic), with the
  // DB write in the background and a rollback if it fails.
  const [dateById, setDateById] = useState<Record<string, string>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const router = useRouter();
  const advanceStatus = useAdvanceContentStatus();

  /** Ring tap on a day card — one stage, through the shared status store. */
  const advance = useCallback(
    (piece: ContentPiece) => {
      void advanceStatus(piece);
    },
    [advanceStatus],
  );

  // Dates stay local (drag is optimistic); status comes from the ONE store, so
  // a piece on the calendar can never disagree with the same piece on Home.
  const dated = useMemo(
    () =>
      pieces.map((p) => (dateById[p.id] ? { ...p, scheduledDate: dateById[p.id] } : p)),
    [pieces, dateById],
  );
  const effective = useLiveStatuses(dated);
  const byDay = useMemo(() => groupByScheduledDate(effective), [effective]);

  const sensors = useSensors(
    // TOUCH: only a hold arms a drag, so scrolling the day list and tapping a
    // card are both safe. MOUSE is separate on purpose — PointerSensor also
    // fires for touch, and its 6px distance meant a 6px scroll could start a
    // drag on a phone (§0/§6).
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragStart = useCallback((e: DragStartEvent) => {
    setDraggingId(String(e.active.id).replace('piece:', ''));
    // A short tap confirms the card is HELD — without it a long-press feels
    // like nothing happened until the card moves.
    try {
      (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(12);
    } catch {
      /* no-op */
    }
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setDraggingId(null);
      const overId = e.over?.id ? String(e.over.id) : '';
      if (!overId.startsWith('day:')) return;
      const dayKey = overId.slice(4);
      const pieceId = String(e.active.id).replace('piece:', '');
      const piece = effective.find((p) => p.id === pieceId);
      if (!piece || piece.scheduledDate?.slice(0, 10) === dayKey) return;

      const prev = piece.scheduledDate ?? '';
      setDateById((m) => ({ ...m, [pieceId]: dayKey }));
      void setContentScheduledDate(piece.refTable, pieceId, dayKey).then((res) => {
        if (!res.ok) setDateById((m) => ({ ...m, [pieceId]: prev }));
      });
    },
    [effective],
  );

  const draggingPiece = draggingId ? effective.find((p) => p.id === draggingId) ?? null : null;
  const cells = useMemo(
    () => monthGrid(view.year, view.month0, todayKey),
    [view.year, view.month0, todayKey],
  );

  const dayPieces = selected ? byDay.get(selected) ?? [] : [];

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
    <div className="app-page">
      {/* Header: Month YYYY + arrows */}
      <div className="mb-4 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-[color:var(--foreground)]">
            План
          </h1>
          <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
            {monthLabel(view.year, view.month0)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Попередній місяць"
            data-testid="cal-prev"
            onClick={() => setView((v) => shiftMonth(v.year, v.month0, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Наступний місяць"
            data-testid="cal-next"
            onClick={() => setView((v) => shiftMonth(v.year, v.month0, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* The calendar shows ONLY committed, dated pieces. The undecided live in
          Розбір — surfaced here as a count so they stay visible without
          polluting the plan with maybes. */}
      <div className="mb-3">
        <StagingPressureCard count={stagedCount} overdue={stagedOverdue} />
      </div>

      {/* Calendar card */}
      <div className="app-card px-2 pb-2 pt-3">
      {/* Weekday header */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const count = byDay.get(cell.key)?.length ?? 0;
          const isSelected = selected === cell.key;
          return (
            <DroppableDay key={cell.key} dayKey={cell.key}>
            <button
              type="button"
              data-testid="cal-day"
              data-day={cell.key}
              data-count={count}
              data-selected={isSelected ? 'true' : 'false'}
              onClick={() => setSelected(cell.key)}
              className="relative flex h-full w-full items-center justify-center"
            >
              {/* Selected fill (wins over today's accent text). */}
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

              {/* Count badge, top-right. Inverts when the day is selected. */}
              {count > 0 && (
                <span
                  data-testid="cal-badge"
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
            </DroppableDay>
          );
        })}
      </div>
      </div>

      {/* Detail panel */}
      <div className="mt-5" data-testid="cal-detail">
        {!selected ? (
          <p className="px-2 py-8 text-center text-[13px] text-[color:var(--text-muted)]">
            Обери дату, щоб побачити деталі.
          </p>
        ) : (
          <div>
            <div className="mb-2.5 flex items-center justify-between px-0.5">
              <h2 className="app-section-label">{dayHeaderLabel(selected)}</h2>
              {/* Create is always available on a selected day — full state or empty. */}
              <PlanCreateMenu />
            </div>
            {dayPieces.length > 0 ? (
              /* ONE card set (§6). There used to be a second, dimmer list below
                 holding the drag handles — the same pieces twice, which read as
                 a bug. The cards themselves now carry the gesture. */
              <div>
                <p className="px-1 pb-2 text-[11px] font-medium text-[color:var(--text-muted)]">
                  Затисни картку і перетягни на інший день
                </p>
                {dayPieces.map((p) => (
                  <DraggableContentCard
                    key={p.id}
                    piece={p}
                    onOpen={() => router.push(contentHref(p))}
                    onAdvance={() => advance(p)}
                  />
                ))}
              </div>
            ) : (
              <div className="app-card px-6 py-9 text-center">
                <p className="text-[14px] font-semibold text-[color:var(--foreground)]">
                  Нічого не заплановано
                </p>
                <p className="mt-1 text-[13px] text-[color:var(--text-muted)]">
                  Створи щось нове на цей день.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* The floating proxy that follows the thumb. `dropAnimation` stays null —
        the card settles by the day cell re-rendering, not by flying back. */}
    <DragOverlay dropAnimation={null}>
      {draggingPiece ? (
        <div
          className="flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-white px-3 py-2 shadow-[var(--elev-3)]"
          style={{ animation: 'cal-drag-float 1.6s ease-in-out infinite' }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: STATUS_COLORS[draggingPiece.status] }}
          />
          <span className="max-w-[190px] truncate text-[13px] font-semibold text-[color:var(--foreground)]">
            {draggingPiece.title}
          </span>
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}
