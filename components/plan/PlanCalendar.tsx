'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
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
import { createContentOnDate, setContentScheduledDate } from '@/app/content-actions';
import { STATUS_COLORS } from '@/lib/content/statusSystem';
import {
  useAdvanceContentStatus,
  useLiveStatuses,
} from '@/lib/content/contentStatusStore';
import { contentHref } from '@/lib/content/contentPiece';
import PlanCreateMenu from '@/components/plan/PlanCreateMenu';
import CalendarShareButton from '@/components/plan/CalendarShareButton';
import StagingPressureCard from '@/components/staging/StagingPressureCard';
import PieceDetail from '@/components/share/PieceDetail';
import PieceInlineEditor from '@/components/plan/PieceInlineEditor';
import type { RadialOptionId } from '@/components/CreateRadialMenu';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';
import type { EditableDoc } from '@/lib/plan/editableDoc';
import type { ContentPiece } from '@/lib/content/contentPiece';
import type { CalendarShareLink, SharedPieceDetail } from '@/lib/calendar/sharedCalendar';
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
  selected,
  onOpen,
  onAdvance,
}: {
  piece: ContentPiece;
  /** Currently shown in the panel beside the calendar. */
  selected: boolean;
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
      data-selected={selected ? 'true' : 'false'}
      onClick={onOpen}
      className="mb-2.5 cursor-grab rounded-[16px] border bg-[color:var(--background)] p-3.5 active:cursor-grabbing"
      style={{
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        // Lift: shrink under the thumb + a deeper shadow so it reads as held
        // and OFF the page, rather than merely highlighted.
        transform: isDragging ? 'scale(0.96)' : undefined,
        boxShadow: isDragging
          ? '0 18px 36px rgba(16,17,33,0.24)'
          : selected
            ? '0 0 0 1px var(--accent)'
            : 'var(--elev-1)',
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
  shareLink = null,
  canShare = true,
  shareTitle = 'Контент-план',
}: {
  pieces: ContentPiece[];
  stagedCount: number;
  stagedOverdue: number;
  /** The calendar's existing client link, if one has been created. */
  shareLink?: CalendarShareLink | null;
  /** False in Pro's "All bloggers" view — there is no single plan to share. */
  canShare?: boolean;
  /** Seeds the header the client sees when the owner has not set one. */
  shareTitle?: string;
}) {
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const [view, setView] = useState(() => ({ year: now.getFullYear(), month0: now.getMonth() }));
  const [selected, setSelected] = useState<string | null>(null);

  // The piece open beside the calendar. Tapping a card used to leave the page
  // for the editor, which meant answering «що це взагалі за рілс» cost a
  // navigation and a way back. Same split the client's shared link has.
  const [openPiece, setOpenPiece] = useState<ContentPiece | null>(null);
  const [detail, setDetail] = useState<SharedPieceDetail | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // ── the same panel, editable ──
  // Editing is a MODE of the open piece, not a second screen: the panel keeps
  // its place, its scroll and its full-screen state, and only what is inside it
  // changes. Coming back out is the same flip in reverse.
  const [editing, setEditing] = useState(false);
  const [editDoc, setEditDoc] = useState<EditableDoc | null>(null);
  const [editFailedId, setEditFailedId] = useState<string | null>(null);
  // Bumped after a save so the read-only document is fetched again — otherwise
  // the panel would flip back to the version it opened with.
  const [detailNonce, setDetailNonce] = useState(0);

  // Pieces made from this screen, held locally until the server read catches
  // up. Without them a freshly created reel would be invisible on the very day
  // it was just put on.
  const [created, setCreated] = useState<ContentPiece[]>([]);
  const [creating, setCreating] = useState(false);

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
  const dated = useMemo(() => {
    // A locally created piece is dropped as soon as the server read carries it,
    // so the two copies can never both be on the day.
    const known = new Set(pieces.map((p) => p.id));
    const all = [...pieces, ...created.filter((p) => !known.has(p.id))];
    return all.map((p) => (dateById[p.id] ? { ...p, scheduledDate: dateById[p.id] } : p));
  }, [pieces, created, dateById]);
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

  // Derived, not stored: a piece is "loading" precisely while the detail on
  // hand is not yet its own.
  const detailFailed = !!openPiece && failedId === openPiece.id;
  const detailLoading = !!openPiece && !detailFailed && detail?.id !== openPiece.id;

  /** Show a piece in the panel; on a phone that means raising the sheet. */
  const openPreview = useCallback((piece: ContentPiece) => {
    setOpenPiece(piece);
    setSheetOpen(true);
    setEditing(false);
    setEditDoc(null);
  }, []);

  const closePreview = useCallback(() => {
    setSheetOpen(false);
    setExpanded(false);
    setEditing(false);
  }, []);

  /**
   * Where a piece is edited.
   *
   * A reel and a storytelling are text in order — they fit in the panel, so
   * they are edited in the panel. A carousel is a designed object (colours,
   * placement, photos, export) and the panel could only ever offer a fraction
   * of its editor, so it opens its own — in a NEW TAB, so the month you were
   * planning is still there behind it.
   */
  const editsInPanel = useCallback(
    (piece: ContentPiece) =>
      piece.refTable === 'projects' || piece.refTable === 'storytelling_projects',
    [],
  );

  const openFullEditor = useCallback(
    (piece: ContentPiece) => {
      if (piece.refTable === 'carousel_projects') {
        window.open(contentHref(piece), '_blank', 'noopener,noreferrer');
        return;
      }
      router.push(contentHref(piece));
    },
    [router],
  );

  /** Flip the open piece into edit mode, loading its rows to type into. */
  const startEditing = useCallback((piece: ContentPiece) => {
    setEditing(true);
    setEditDoc(null);
    setEditFailedId(null);

    fetch('/api/plan/editable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refTable: piece.refTable, id: piece.id }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('failed');
        const json = (await res.json()) as { doc: EditableDoc };
        setEditDoc(json.doc);
      })
      .catch(() => setEditFailedId(piece.id));
  }, []);

  /** Saved: read the piece back, drop out of edit mode, refresh the month. */
  const finishEditing = useCallback(() => {
    setEditing(false);
    setEditDoc(null);
    setDetail(null);
    setDetailNonce((n) => n + 1);
    router.refresh();
  }, [router]);

  /**
   * «＋ Створити» on a selected day.
   *
   * The piece is made ON that day and opened right here, already editable —
   * creating something used to mean being sent to an empty builder and finding
   * your way back to the calendar afterwards. A carousel still goes to its own
   * editor, in a new tab; an idea is a braindump, which has its own overlay.
   */
  const createOnSelectedDay = useCallback(
    (id: RadialOptionId) => {
      if (!selected || creating) return;

      if (id === 'ideas') {
        window.dispatchEvent(new CustomEvent(OPEN_BRAINDUMP_FRESH_EVENT));
        return;
      }

      const type = id === 'reels' ? 'reel' : id === 'carousel' ? 'carousel' : 'story';
      setCreating(true);
      void createContentOnDate(type, selected)
        .then((res) => {
          if (!res.ok) return;

          const now = new Date().toISOString();
          const piece: ContentPiece = {
            id: res.id,
            userId: '',
            type: res.type,
            status: 'idea',
            title: res.title,
            refTable: res.refTable,
            scheduledDate: selected,
            createdAt: now,
            updatedAt: now,
          };
          setCreated((prev) => [...prev, piece]);

          if (res.refTable === 'carousel_projects') {
            window.open(res.href, '_blank', 'noopener,noreferrer');
          } else {
            openPreview(piece);
            startEditing(piece);
          }
          router.refresh();
        })
        .finally(() => setCreating(false));
    },
    [selected, creating, openPreview, startEditing, router],
  );

  // One fetch per opened piece, through the same document the shared calendar
  // reads — no token here, `auth.uid()` is the credential.
  useEffect(() => {
    if (!openPiece) return;
    let cancelled = false;
    const { id, refTable } = openPiece;
    fetch('/api/plan/detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refTable, id }),
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
  }, [openPiece, detailNonce]);

  // Escape backs out one layer at a time — but never out of an edit. Losing a
  // half-written story to a stray keypress is exactly the kind of thing this
  // panel exists to stop; leaving is Скасувати, which asks first.
  useEffect(() => {
    if (!sheetOpen && !expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (expanded) setExpanded(false);
      else if (!editing) setSheetOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen, expanded, editing]);

  /**
   * The panel, wherever it is showing — beside the calendar, as a phone sheet,
   * or full screen. Defined once: written out three times, "editing" would have
   * three chances to behave differently in each.
   */
  const panel = (surface: string, isExpanded: boolean) => {
    if (!openPiece) return null;

    if (editing) {
      return (
        <PieceInlineEditor
          doc={editDoc}
          loading={!editDoc && editFailedId !== openPiece.id}
          failed={editFailedId === openPiece.id}
          typeLabel={openPiece.type}
          scheduledDate={openPiece.scheduledDate}
          expanded={isExpanded}
          surface={surface}
          onToggleExpand={() => setExpanded(!isExpanded)}
          onOpenFullEditor={() => openFullEditor(openPiece)}
          onCancel={() => {
            setEditing(false);
            setEditDoc(null);
          }}
          onSaved={finishEditing}
        />
      );
    }

    return (
      <PieceDetail
        detail={detail}
        loading={detailLoading}
        failed={detailFailed}
        expanded={isExpanded}
        surface={surface}
        onToggleExpand={() => setExpanded(!isExpanded)}
        onEdit={editsInPanel(openPiece) ? () => startEditing(openPiece) : undefined}
        onOpenEditor={() => openFullEditor(openPiece)}
        openEditorLabel={
          openPiece.refTable === 'carousel_projects'
            ? 'Редагувати в новій вкладці'
            : 'Відкрити повний редактор'
        }
      />
    );
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
    {/* `app-page` is 640px — right for a single column, too narrow for a split.
        The page widens only once a piece is open, so a plain calendar still
        sits centred instead of hugging the left edge of a wide screen. */}
    <div
      className={`mx-auto w-full px-4 pb-6 pt-5 ${
        openPiece ? 'max-w-[640px] lg:max-w-[1200px]' : 'max-w-[640px]'
      }`}
    >
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
          {/* Sharing lives next to the month, not in a settings screen: the
              thing being shared is the calendar you are looking at. */}
          <CalendarShareButton
            initialLink={shareLink}
            canShare={canShare}
            defaultTitle={shareTitle}
          />
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

      {/* Calendar + day list on the left, the opened piece on the right — the
          same split the client's shared link uses, so «що це за рілс» is
          answered without leaving the month. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 lg:w-[400px] lg:shrink-0">

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
              {/* Create is always available on a selected day — full state or
                  empty. It creates ON this day and opens the new piece in the
                  panel, rather than sending you to an empty builder. */}
              <PlanCreateMenu onSelect={createOnSelectedDay} />
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
                    selected={openPiece?.id === p.id}
                    onOpen={() => openPreview(p)}
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

      {/* The opened piece, beside the calendar on a wide screen. */}
      {openPiece && (
        <div className="hidden min-w-0 flex-1 lg:block">
          <div
            data-testid="plan-detail-panel"
            data-editing={editing ? 'true' : 'false'}
            className="app-card sticky top-4 max-h-[calc(100dvh-32px)] overflow-y-auto p-5"
            style={editing ? { boxShadow: '0 0 0 1.5px var(--accent)' } : undefined}
          >
            {panel('var(--background)', false)}
          </div>
        </div>
      )}
      </div>
    </div>

    {/* Full screen: the piece with nothing else on the page. */}
    {openPiece && expanded && (
      <div
        className="fixed inset-0 z-[60] overflow-y-auto"
        style={{ background: 'var(--canvas)' }}
        role="dialog"
        aria-modal="true"
        data-testid="plan-detail-full"
      >
        <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-5 md:px-8">
          {panel('var(--canvas)', true)}
        </div>
      </div>
    )}

    {/* Phone: the same panel as a sheet, since 50/50 of a phone is two useless
        halves. */}
    {openPiece && sheetOpen && !expanded && (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-black/40 lg:hidden"
        role="dialog"
        aria-modal="true"
        data-testid="plan-detail-sheet"
      >
        <button
          type="button"
          className="flex-1 cursor-default"
          aria-label="Закрити"
          onClick={closePreview}
        />
        <div
          className="max-h-[88dvh] overflow-y-auto rounded-t-[22px] bg-[color:var(--background)] px-4 pb-10 pt-4"
          style={{ boxShadow: '0 -8px 40px rgba(16,17,33,0.24)' }}
        >
          <div className="mb-3 flex justify-end">
            <button type="button" onClick={closePreview} aria-label="Закрити" className="app-icon-btn">
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
          {panel('var(--background)', false)}
        </div>
      </div>
    )}

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
