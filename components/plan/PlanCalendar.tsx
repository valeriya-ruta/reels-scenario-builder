'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  TouchSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import ContentRows from '@/components/content/ContentRows';
import { setContentScheduledDate } from '@/app/content-actions';
import { STATUS_COLORS } from '@/lib/content/statusSystem';
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

/** A scheduled piece in the day panel — press and hold to lift, then drop on a day. */
function DraggablePiece({ piece }: { piece: ContentPiece }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `piece:${piece.id}` });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex cursor-grab items-center gap-2 rounded-[10px] px-2 py-2 active:cursor-grabbing"
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: 'none' }}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" />
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[piece.status] }}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[color:var(--foreground)]">
        {piece.title}
      </span>
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

  const effective = useMemo(
    () => pieces.map((p) => (dateById[p.id] ? { ...p, scheduledDate: dateById[p.id] } : p)),
    [pieces, dateById],
  );
  const byDay = useMemo(() => groupByScheduledDate(effective), [effective]);

  const sensors = useSensors(
    // Press-and-hold to lift on touch (so vertical scrolling still works),
    // small-distance drag on pointer devices.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragStart = useCallback((e: DragStartEvent) => {
    setDraggingId(String(e.active.id).replace('piece:', ''));
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
              <>
                <div>
                  <ContentRows pieces={dayPieces} />
                </div>
                {/* Hold a row here and drop it on any day above to reschedule. */}
                <div className="mt-2 rounded-[14px] border border-dashed border-[color:var(--border)] p-1">
                  <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-[color:var(--text-muted)]">
                    Перетягни на інший день, щоб перенести
                  </p>
                  {dayPieces.map((p) => (
                    <DraggablePiece key={p.id} piece={p} />
                  ))}
                </div>
              </>
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

    <DragOverlay dropAnimation={null}>
      {draggingPiece ? (
        <div className="flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-white px-3 py-2 shadow-[var(--elev-3)]">
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
