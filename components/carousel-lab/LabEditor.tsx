'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { restrictToHorizontalAxis, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronDown, ChevronRight, Calendar, Download, Loader2, Pencil, Plus, Trash2, Undo2, Redo2, X } from 'lucide-react';
import { LAB_CANVAS_W as CW, LAB_CANVAS_H as CH, type LabSlide, type LabImage, type LabStyleId } from '@/lib/carousel-lab/types';
import { SLOTS, type Slot } from '@/lib/carousel-lab/tokens';
import { getT, normalizeT, zoomAroundPoint, type ImgT } from '@/lib/carousel-lab/imageTransform';
import { createSlide } from '@/lib/carousel-lab/defaults';
import { saveLabSlides, updateLabStyle, renameLabProject } from '@/app/carousel-lab/actions';
import { slideToPngBlob, blobToBase64, downloadBlob, downloadZipOfBlobs, sharePngBlobs } from '@/lib/carousel-lab/exportPng';
import LabSlideCanvas from './LabSlideCanvas';
import LabTypeTab from './LabTypeTab';
import LabFields from './LabFields';
import LabExportOverlay from './LabExportOverlay';

type EditorTab = 'type' | 'text' | 'position' | 'bg' | 'brand';
const BAR = 72;

function LabTabIcon({ tab, active, size = 22 }: { tab: EditorTab; active: boolean; size?: number }) {
  const s = active ? '#4a6cf7' : '#555';
  const sw = size >= 26 ? 2 : 1.6;
  if (tab === 'type') return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2" stroke={s} strokeWidth={sw} /><path d="M4 9h16" stroke={s} strokeWidth={sw} /></svg>);
  if (tab === 'text') return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M6 6h12M12 6v12" stroke={s} strokeWidth={sw} strokeLinecap="round" /></svg>);
  if (tab === 'position') return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M4 7h16M7 12h10M9 17h6" stroke={s} strokeWidth={sw} strokeLinecap="round" /></svg>);
  if (tab === 'bg') return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2" stroke={s} strokeWidth={sw} /><circle cx="9" cy="10" r="1.5" stroke={s} strokeWidth={sw} /><path d="M7 17l10-8" stroke={s} strokeWidth={sw} /></svg>);
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7z" stroke={s} strokeWidth={sw} strokeLinejoin="round" /><circle cx="7.5" cy="11.5" r="1" fill={s} /><circle cx="12" cy="8" r="1" fill={s} /><circle cx="16" cy="11" r="1" fill={s} /></svg>);
}

/** All image slots shown on the preview (with a hasImage flag + fit). */
function previewImageSlots(slide: LabSlide): { slot: Slot; index: number; fit: 'cover' | 'contain'; hasImage: boolean }[] {
  const has = (i: number) => { const im = slide.images[i]; return !!(im && (im.url || im.base64)); };
  const out: { slot: Slot; index: number; fit: 'cover' | 'contain'; hasImage: boolean }[] = [];
  if (slide.type === 'text' && slide.picturePosition !== 'none') {
    const slot = slide.picturePosition === 'up' ? SLOTS.textImageUp : slide.picturePosition === 'down' ? SLOTS.textImageDown : { x: 76, y: 500, w: 928, h: 350 };
    out.push({ slot, index: 0, fit: 'cover', hasImage: has(0) });
  }
  if (slide.subtype === 'screenshot') out.push({ slot: SLOTS.screenshot, index: 0, fit: 'contain', hasImage: has(0) });
  if (slide.subtype === 'before_after') SLOTS.beforeAfter.forEach((slot, i) => out.push({ slot, index: i, fit: 'cover', hasImage: has(i) }));
  if (slide.subtype === 'point_ab') SLOTS.pointAbDiagonal.forEach((slot, i) => out.push({ slot, index: i, fit: 'cover', hasImage: has(i) }));
  return out;
}

/** Overlays on the preview (logic stolen from the main app's photo positioner):
 *  an EMPTY slot (or a contain screenshot) taps to open the photo panel; a FILLED
 *  cover slot supports drag-to-pan, pinch-to-zoom (2 fingers) and wheel-to-zoom. */
function ImageHandles({ slide, boxW, onPatch, onOpenPhoto }: { slide: LabSlide; boxW: number; onPatch: (index: number, t: ImgT) => void; onOpenPhoto: () => void }) {
  const scale = boxW / CW;
  const ptrs = useRef<Map<number, { x: number; y: number }>>(new Map());
  const g = useRef<{ index: number; mode: 'drag' | 'pinch'; sx: number; sy: number; initial: ImgT; dist: number; a: number; b: number } | null>(null);

  return (
    <>
      {previewImageSlots(slide).map(({ slot, index, fit, hasImage }) => {
        const box = { left: slot.x * scale, top: slot.y * scale, width: slot.w * scale, height: slot.h * scale } as const;
        if (!(hasImage && fit === 'cover')) {
          return <div key={index} className="absolute cursor-pointer" style={box} onClick={onOpenPhoto} aria-label="Додати фото" />;
        }
        const t = getT(slide.images[index]?.transform ?? null);
        return (
          <div
            key={index}
            className="absolute touch-none"
            style={{ ...box, cursor: 'grab' }}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              const ids = [...ptrs.current.keys()];
              if (ids.length >= 2) {
                const a = ptrs.current.get(ids[0])!;
                const b = ptrs.current.get(ids[1])!;
                g.current = { index, mode: 'pinch', sx: 0, sy: 0, initial: t, dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), a: ids[0], b: ids[1] };
              } else {
                g.current = { index, mode: 'drag', sx: e.clientX, sy: e.clientY, initial: t, dist: 0, a: e.pointerId, b: -1 };
              }
            }}
            onPointerMove={(e) => {
              if (!ptrs.current.has(e.pointerId) || !g.current || g.current.index !== index) return;
              ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const gg = g.current;
              if (gg.mode === 'pinch') {
                const a = ptrs.current.get(gg.a);
                const b = ptrs.current.get(gg.b);
                if (!a || !b) return;
                const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
                const cx = (a.x + b.x) / 2 - rect.left - rect.width / 2;
                const cy = (a.y + b.y) / 2 - rect.top - rect.height / 2;
                onPatch(index, zoomAroundPoint(gg.initial, gg.initial.scale * (dist / gg.dist), cx, cy, rect.width, rect.height));
              } else {
                onPatch(index, normalizeT({ tx: gg.initial.tx + (e.clientX - gg.sx) / rect.width, ty: gg.initial.ty + (e.clientY - gg.sy) / rect.height, scale: gg.initial.scale }));
              }
            }}
            onPointerUp={(e) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) g.current = ptrs.current.size ? g.current : null; }}
            onPointerCancel={(e) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size === 0) g.current = null; }}
            onWheel={(e) => {
              e.preventDefault();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const px = e.clientX - rect.left - rect.width / 2;
              const py = e.clientY - rect.top - rect.height / 2;
              onPatch(index, zoomAroundPoint(t, t.scale - e.deltaY * 0.0015, px, py, rect.width, rect.height));
            }}
          />
        );
      })}
    </>
  );
}

function LabSortableThumb({ slide, index, active, onSelect, size, wholeTileDrag = false, showTrash = false, canDelete = true, onDelete }: {
  slide: LabSlide; index: number; active: boolean; onSelect: () => void; size: 'sm' | 'md';
  wholeTileDrag?: boolean; showTrash?: boolean; canDelete?: boolean; onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const dragT = CSS.Transform.toString(transform);
  const liftT = isDragging ? `${dragT ? `${dragT} ` : ''}translateY(-8px) scale(1.06)` : dragT || undefined;
  const thumbHeight = size === 'sm' ? 58 : 78;
  const thumbWidth = Math.round((thumbHeight * CW) / CH);
  const style: CSSProperties = {
    transform: liftT, transition, opacity: isDragging ? 0.95 : 1, zIndex: isDragging ? 30 : undefined,
    boxShadow: isDragging ? '0 10px 24px rgba(0,0,0,0.28)' : undefined,
    touchAction: wholeTileDrag ? 'pan-x' : undefined, width: thumbWidth, height: thumbHeight,
    ...(wholeTileDrag ? { userSelect: 'none' as const, WebkitUserSelect: 'none' as const, WebkitTouchCallout: 'none' as const } : {}),
  };
  return (
    <div ref={setNodeRef} style={style} {...(wholeTileDrag ? { ...attributes, ...listeners } : {})} role="button" tabIndex={0}
      onClick={onSelect} data-testid={`thumb-${index}`}
      className={['relative shrink-0 cursor-pointer select-none overflow-hidden rounded-[5px]', active ? 'ring-2' : 'ring-1 ring-black/10'].join(' ')}
      aria-label={`Слайд ${index + 1}`} aria-current={active ? 'true' : undefined}>
      <span className="absolute inset-0 overflow-hidden rounded-[5px]"><LabSlideCanvas slide={slide} renderWidth={thumbWidth} /></span>
      <span className="pointer-events-none absolute inset-0" style={{ borderRadius: 5, border: active ? '2px solid #4a6cf7' : '1px solid rgba(0,0,0,0.08)' }} />
      {showTrash && canDelete ? (
        <button type="button" aria-label={`Видалити слайд ${index + 1}`} onClick={(e) => { e.stopPropagation(); onDelete?.(); }} onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-0 z-[2] flex items-center justify-center rounded-md bg-black/55 text-white"><Trash2 className="h-5 w-5" /></button>
      ) : null}
    </div>
  );
}

export default function LabEditor({ projectId, initialName, initialStyleId, initialSlides }: {
  projectId: string; initialName: string; initialStyleId: LabStyleId; initialSlides: LabSlide[];
}) {
  const initial = initialSlides.length ? initialSlides : [createSlide('cover', 'title_subtext')];
  // Undo/redo history. Rapid edits (typing) within 500ms coalesce into one step.
  const [hist, setHist] = useState<{ past: LabSlide[][]; present: LabSlide[]; future: LabSlide[][] }>({ past: [], present: initial, future: [] });
  const slides = hist.present;
  const lastPush = useRef(0);
  const panelSwipe = useRef<{ y: number } | null>(null);
  const setSlides = useCallback((updater: LabSlide[] | ((prev: LabSlide[]) => LabSlide[])) => {
    setHist((h) => {
      const next = typeof updater === 'function' ? (updater as (p: LabSlide[]) => LabSlide[])(h.present) : updater;
      if (next === h.present) return h;
      const now = Date.now();
      const coalesce = now - lastPush.current < 500;
      lastPush.current = now;
      if (coalesce) return { ...h, present: next };
      return { past: [...h.past, h.present].slice(-100), present: next, future: [] };
    });
  }, []);
  const undo = useCallback(() => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h)), []);
  const redo = useCallback(() => setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)), []);
  const canUndo = hist.past.length > 0;
  const canRedo = hist.future.length > 0;
  const [styleId] = useState<LabStyleId>(initialStyleId);
  const [name, setName] = useState(initialName);
  const [activeSlideId, setActiveSlideId] = useState(slides[0]?.id ?? '');
  const [tab, setTab] = useState<EditorTab | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportImages, setExportImages] = useState<(string | null)[]>([]);
  const [exportDone, setExportDone] = useState<boolean[]>([]);
  const [exportGenIndex, setExportGenIndex] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportBlobsRef = useRef<(Blob | null)[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [trashForId, setTrashForId] = useState<string | null>(null);

  const activeIndex = Math.max(0, slides.findIndex((s) => s.id === activeSlideId));
  const activeSlide = slides[activeIndex] ?? slides[0];
  const panelOpen = tab !== null;

  // ── autosave ────────────────────────────────────────────────────────────
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaveState('saving');
    const t = setTimeout(async () => {
      await saveLabSlides(projectId, slides);
      await updateLabStyle(projectId, styleId);
      setSaveState('saved');
    }, 700);
    return () => clearTimeout(t);
  }, [slides, styleId, projectId]);

  const patchActive = useCallback((patch: Partial<LabSlide>) => {
    setSlides((prev) => prev.map((s) => (s.id === activeSlide?.id ? { ...s, ...patch } : s)));
  }, [activeSlide?.id]);
  const patchImage = useCallback((index: number, transform: ImgT) => {
    setSlides((prev) => prev.map((s) => (s.id === activeSlide?.id ? { ...s, images: s.images.map((im: LabImage, i: number) => (i === index ? { ...im, transform } : im)) } : s)));
  }, [activeSlide?.id]);

  const MAX_SLIDES = 20;
  function addSlide() {
    if (slides.length >= MAX_SLIDES) return;
    const s = createSlide('text', 'paragraph');
    setSlides((prev) => { const i = prev.findIndex((x) => x.id === activeSlideId); const n = [...prev]; n.splice(i + 1, 0, s); return n; });
    setActiveSlideId(s.id);
    setTab('type'); // new slide → open the type picker automatically
  }
  function removeSlide(id: string) {
    setSlides((prev) => { if (prev.length <= 1) return prev; const i = prev.findIndex((s) => s.id === id); const n = prev.filter((s) => s.id !== id); if (id === activeSlideId) setActiveSlideId(n[Math.max(0, i - 1)].id); return n; });
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e; if (!over || active.id === over.id) return;
    setSlides((prev) => { const from = prev.findIndex((s) => s.id === active.id); const to = prev.findIndex((s) => s.id === over.id); if (from < 0 || to < 0) return prev; const n = [...prev]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
  }
  const commitTitle = () => { setEditingTitle(false); const t = titleDraft.trim(); if (t && t !== name) { setName(t); renameLabProject(projectId, t); } };

  // ── layout / responsive ───────────────────────────────────────────────────
  const [isDesktop, setIsDesktop] = useState(false);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const desktopBoxRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.28);
  const [desktopScale, setDesktopScale] = useState(0.25);
  const [vh, setVh] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  const [chromeH, setChromeH] = useState(BAR);

  useLayoutEffect(() => { const mq = window.matchMedia('(min-width: 768px)'); const a = () => setIsDesktop(mq.matches); a(); mq.addEventListener('change', a); return () => mq.removeEventListener('change', a); }, []);
  useEffect(() => { const r = () => setVh(window.innerHeight); r(); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  useLayoutEffect(() => {
    if (isDesktop) return; const el = previewAreaRef.current; if (!el) return;
    const upd = () => { const w = el.clientWidth, h = el.clientHeight; if (w <= 0 || h <= 0) return; const s = Math.min(w / CW, (h - 4) / CH); setPreviewScale(Math.max(0.06, Math.min(s, 1))); };
    upd(); const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect();
  }, [isDesktop, tab, panelOpen, vh, chromeH]);
  useLayoutEffect(() => {
    if (isDesktop) return; const el = chromeRef.current; if (!el) return;
    const upd = () => setChromeH(el.getBoundingClientRect().height || BAR);
    upd(); const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect();
  }, [isDesktop, tab, vh, slides.length, activeSlideId]);
  useLayoutEffect(() => {
    if (!isDesktop) return; const el = desktopBoxRef.current; if (!el) return;
    const upd = () => { const w = el.clientWidth; if (w <= 0) return; setDesktopScale(Math.max(0.06, Math.min(w / CW, 1))); };
    upd(); const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect();
  }, [isDesktop, tab, panelOpen, activeSlideId, slides.length]);

  const goSlide = useCallback((d: number) => { const n = activeIndex + d; if (n < 0 || n >= slides.length) return; setActiveSlideId(slides[n].id); }, [activeIndex, slides]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (window.matchMedia('(max-width: 767px)').matches) return; if (e.key === 'ArrowLeft') { e.preventDefault(); goSlide(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); goSlide(1); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [goSlide]);

  // Longer hold + tighter tolerance so scrolling a long filmstrip doesn't
  // accidentally start a reorder (a quick horizontal swipe cancels the press).
  const mobileSensors = useSensors(useSensor(TouchSensor, { activationConstraint: { delay: 320, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const desktopSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const sensors = isDesktop ? desktopSensors : mobileSensors;
  const dragModifiers = useMemo(() => [isDesktop ? restrictToVerticalAxis : restrictToHorizontalAxis], [isDesktop]);

  const tabLabel = (t: EditorTab) => (t === 'type' ? 'Тип' : t === 'text' ? 'Текст' : t === 'position' ? 'Позиція' : t === 'bg' ? 'Фото' : 'Бренд');

  async function exportAll() {
    const list = slides;
    setExportOpen(true);
    setExportError(null);
    setExportBusy(true);
    const imgs: (string | null)[] = new Array(list.length).fill(null);
    const done: boolean[] = new Array(list.length).fill(false);
    const blobs: (Blob | null)[] = new Array(list.length).fill(null);
    setExportImages([...imgs]);
    setExportDone([...done]);
    setExportGenIndex(0);
    try {
      for (let i = 0; i < list.length; i++) {
        setExportGenIndex(i);
        const blob = await slideToPngBlob(list[i]);
        blobs[i] = blob;
        imgs[i] = await blobToBase64(blob);
        done[i] = true;
        setExportImages([...imgs]);
        setExportDone([...done]);
      }
      exportBlobsRef.current = blobs;
    } catch {
      setExportError('Не вдалося відрендерити слайди. Спробуй ще раз.');
    } finally {
      setExportBusy(false);
    }
  }
  const exportGenerated = exportImages.length > 0 && exportImages.every((x) => x !== null);
  const onDownloadAll = () => void downloadZipOfBlobs(exportBlobsRef.current, name || 'carousel');
  const onSaveOne = (i: number) => { const b = exportBlobsRef.current[i]; if (b) downloadBlob(b, `${name || 'slide'}-${i + 1}.png`); };
  const onShareAll = () => void sharePngBlobs(exportBlobsRef.current, name || 'carousel');
  const onShareOne = (i: number) => void sharePngBlobs([exportBlobsRef.current[i]], `${name || 'slide'}-${i + 1}`);

  const tabPanel = activeSlide ? (
    tab === 'type' ? <LabTypeTab slide={activeSlide} onChange={patchActive} />
    : tab === 'text' ? <LabFields slide={activeSlide} projectId={projectId} onChange={patchActive} section="text" />
    : tab === 'position' ? (
        <p className="rounded-lg bg-[color:var(--surface)] px-3 py-2 text-sm text-zinc-500">
          {activeSlide.type === 'text'
            ? 'Розташування фото (без / зверху / знизу) обирається у вкладці «Тип».'
            : 'Розташування задане стилем Modern Elegant для цього типу слайду.'}
        </p>
      )
    : tab === 'bg' ? <LabFields slide={activeSlide} projectId={projectId} onChange={patchActive} section="images" />
    : tab === 'brand' ? (
        <div className="px-1"><p className="rounded-lg bg-[color:var(--surface)] px-3 py-2 text-[12.5px] leading-snug text-zinc-600">Стиль: <b>Modern Elegant</b>. Кольори, шрифт (Google Sans) і фон задані стилем каруселі.</p></div>
      )
    : null
  ) : null;

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const undoRedo = (
    <div className="flex items-center gap-1">
      <button type="button" onClick={undo} disabled={!canUndo} aria-label="Скасувати" data-testid="undo"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 disabled:opacity-30 enabled:hover:bg-zinc-100">
        <Undo2 className="h-[18px] w-[18px]" />
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} aria-label="Повторити" data-testid="redo"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 disabled:opacity-30 enabled:hover:bg-zinc-100">
        <Redo2 className="h-[18px] w-[18px]" />
      </button>
    </div>
  );

  const metaChips = (
    <>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#f1f1f4] px-3 py-1.5 text-[13px] font-medium text-zinc-600">
        <span className="h-2 w-2 rounded-full bg-zinc-400" /> Ідея <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#f1f1f4] px-3 py-1.5 text-[13px] font-medium text-zinc-600">
        <Calendar className="h-3.5 w-3.5 text-zinc-500" /> Запланувати
      </span>
    </>
  );

  const renderPreview = (slide: LabSlide, scale: number) => {
    const w = Math.max(40, Math.round(CW * scale));
    return (
      <div className="relative" style={{ width: w }}>
        <LabSlideCanvas slide={slide} renderWidth={w} rounded={Math.round(w * 0.02)} testId={slide.id === activeSlideId ? 'active-preview' : undefined} />
        <ImageHandles slide={slide} boxW={w} onPatch={patchImage} onOpenPhoto={() => setTab('bg')} />
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mobile top bar */}
      <header className="shrink-0 border-b border-[color:var(--border)] bg-[color:var(--background)] px-1 pb-2 pt-3 md:hidden">
        <div className="flex items-center gap-1">
          <Link href="/carousel-lab" aria-label="Назад" className="app-icon-btn shrink-0 inline-flex items-center justify-center rounded-full p-2 text-zinc-600"><ChevronLeft className="h-5 w-5" /></Link>
          {editingTitle ? (
            <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false); }} data-testid="editor-title-input"
              className="min-w-0 flex-1 rounded-[10px] border border-[color:var(--border-strong)] bg-white px-2.5 py-1.5 text-[20px] font-bold tracking-tight outline-none" />
          ) : (
            <button type="button" onClick={() => { setTitleDraft(name); setEditingTitle(true); }} data-testid="editor-title" className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[10px] px-1.5 py-1 text-left">
              <span className="truncate text-[20px] font-bold tracking-tight text-[color:var(--foreground)]">{name}</span>
              <Pencil className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" strokeWidth={2} aria-hidden />
            </button>
          )}
          {undoRedo}
          <button type="button" onClick={exportAll} disabled={exportBusy} aria-label="Експортувати" data-testid="carousel-export"
            className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#4a6cf7' }}>
            {exportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" strokeWidth={2.2} />}
          </button>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-x-auto pl-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{metaChips}</div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col" style={isDesktop ? undefined : { paddingBottom: chromeH, transition: 'padding-bottom 250ms ease' }}>
        {isDesktop ? (
          <div className="flex min-h-0 flex-1 flex-row px-4 pb-2">
            {/* desktop top bar row */}
            <nav className="flex h-full w-[84px] shrink-0 flex-col items-center gap-3 border-r border-black/[0.08] py-4" style={{ background: '#fafaf7' }} aria-label="Панелі">
              {(['type', 'text', 'position', 'bg', 'brand'] as const).map((t) => {
                const active = tab === t;
                return (
                  <button key={t} type="button" data-testid={`tab-d-${t}`} onClick={() => setTab((p) => (p === t ? null : t))}
                    className={['flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center gap-1 rounded-[13px] transition-colors', active ? 'bg-[#eef1ff]' : 'bg-transparent'].join(' ')} aria-pressed={active}>
                    <LabTabIcon tab={t} active={active} size={29} />
                    <span className={active ? 'text-[13px] font-medium text-[#4a6cf7]' : 'text-[13px] font-normal text-[#555]'}>{tabLabel(t)}</span>
                  </button>
                );
              })}
            </nav>
            <div className="shrink-0 overflow-hidden border-r border-black/[0.08] bg-white" style={{ width: panelOpen ? 340 : 0, transition: 'width 0.2s ease' }}>
              <div className="flex h-full min-h-0 min-w-[340px] flex-col">
                {panelOpen && tab !== null ? (
                  <>
                    <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-5 py-4">
                      <span className="text-[15px] font-medium text-zinc-900">{tabLabel(tab)}</span>
                      <button type="button" className="rounded-lg p-0.5 text-zinc-500 hover:bg-zinc-100" onClick={() => setTab(null)} aria-label="Закрити"><X className="h-5 w-5" strokeWidth={1.75} /></button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" style={{ overscrollBehavior: 'contain' }}>{tabPanel}</div>
                  </>
                ) : null}
              </div>
            </div>
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              {/* decorative status row on desktop */}
              <div className="flex items-center gap-2 px-4 pt-3">
                {editingTitle ? null : (
                  <button type="button" onClick={() => { setTitleDraft(name); setEditingTitle(true); }} className="flex items-center gap-1.5 text-[18px] font-bold tracking-tight text-zinc-900">
                    {name} <Pencil className="h-4 w-4 text-zinc-400" />
                  </button>
                )}
                <div className="ml-2 flex gap-1.5">{metaChips}</div>
                <div className="ml-auto flex items-center gap-2">
                  {undoRedo}
                  <span className="text-[12px] text-zinc-400">{saveState === 'saving' ? 'Збереження…' : saveState === 'saved' ? 'Збережено' : ''}</span>
                  <button type="button" onClick={exportAll} disabled={exportBusy} className="inline-flex items-center gap-1.5 rounded-full bg-[#4a6cf7] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                    {exportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Експорт
                  </button>
                </div>
              </div>
              <div className="relative flex min-h-[min(520px,70vh)] flex-1 flex-col">
                <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                  <div ref={desktopBoxRef} className="relative w-[min(80%,48vh)] shrink-0 overflow-hidden rounded-xl shadow-lg" style={{ aspectRatio: `${CW} / ${CH}` }}>
                    {activeSlide ? renderPreview(activeSlide, desktopScale) : null}
                  </div>
                </div>
                <button type="button" className="absolute top-1/2 left-3 z-[2] -translate-y-1/2 rounded-full border border-[color:var(--border)] bg-white/90 p-2 shadow" onClick={() => goSlide(-1)} disabled={activeIndex <= 0} aria-label="Попередній"><ChevronLeft className="h-5 w-5" /></button>
                <button type="button" className="absolute top-1/2 right-3 z-[2] -translate-y-1/2 rounded-full border border-[color:var(--border)] bg-white/90 p-2 shadow" onClick={() => goSlide(1)} disabled={activeIndex >= slides.length - 1} aria-label="Наступний"><ChevronRight className="h-5 w-5" /></button>
              </div>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={dragModifiers}>
              <SortableContext items={slides.map((s) => s.id)} strategy={rectSortingStrategy}>
                <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto px-1 py-0">
                  {slides.map((slide, index) => (
                    <LabSortableThumb key={slide.id} slide={slide} index={index} active={slide.id === activeSlideId} onSelect={() => setActiveSlideId(slide.id)} size="md" />
                  ))}
                  {slides.length < MAX_SLIDES && (
                    <button type="button" onClick={addSlide} data-testid="add-slide" className="flex h-[78px] w-[62px] shrink-0 items-center justify-center rounded-[5px] border border-dashed border-[color:var(--border)] text-zinc-500 hover:bg-[color:var(--surface)]" aria-label="Додати слайд"><Plus className="h-5 w-5" /></button>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div ref={previewAreaRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-1.5 py-0.5" onClick={() => { if (trashForId) setTrashForId(null); }}>
              {activeSlide ? <div className="relative shrink-0">{renderPreview(activeSlide, previewScale)}</div> : null}
            </div>
          </div>
        )}
      </div>

      {/* Mobile bottom chrome */}
      {!isDesktop ? (
        <div ref={chromeRef} className="fixed bottom-0 left-0 right-0 z-40 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {!panelOpen ? (
            <div className="border-t" style={{ borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.06)' }}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={dragModifiers}>
                <SortableContext items={slides.map((s) => s.id)} strategy={rectSortingStrategy}>
                  {/* pt/pb give the lifted (translateY/scale) thumb room so its top
                      isn't clipped by overflow-x's implicit overflow-y during reorder. */}
                  <div className="flex shrink-0 flex-row items-center gap-2 overflow-x-auto overflow-y-visible px-3 pb-3 pt-4">
                    {slides.map((slide, index) => (
                      <LabSortableThumb key={slide.id} slide={slide} index={index} active={slide.id === activeSlideId} size="sm" wholeTileDrag
                        showTrash={trashForId === slide.id} canDelete={slides.length > 1}
                        onSelect={() => { if (slide.id !== activeSlideId) { setTrashForId(null); setActiveSlideId(slide.id); } else if (slides.length > 1) { setTrashForId(slide.id); } }}
                        onDelete={() => { setTrashForId(null); removeSlide(slide.id); }} />
                    ))}
                    {slides.length < MAX_SLIDES && (
                      <button type="button" onClick={() => { setTrashForId(null); addSlide(); }} data-testid="add-slide" className="flex h-[58px] w-[46px] shrink-0 items-center justify-center rounded-[5px] border border-dashed border-[color:var(--border)] text-zinc-500 hover:bg-[color:var(--surface)]" aria-label="Додати слайд"><Plus className="h-5 w-5" /></button>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ) : null}
          <div className="overflow-hidden" style={{ maxHeight: panelOpen ? vh * 0.6 : 0, transition: 'max-height 320ms cubic-bezier(0.22, 0.61, 0.36, 1)' }}>
            <div className="rounded-t-2xl border border-[color:var(--border)] border-b-0 bg-white shadow-[0_-2px_20px_rgba(0,0,0,0.06)]">
              {/* grabber: tap or swipe down to close */}
              <div
                className="flex cursor-grab touch-none items-center justify-center py-2.5"
                onClick={() => setTab(null)}
                onTouchStart={(e) => { panelSwipe.current = { y: e.touches[0].clientY }; }}
                onTouchMove={(e) => {
                  if (panelSwipe.current && e.touches[0].clientY - panelSwipe.current.y > 36) { setTab(null); panelSwipe.current = null; }
                }}
                onTouchEnd={() => { panelSwipe.current = null; }}
              >
                <div className="h-1 w-10 rounded-full bg-zinc-300" />
              </div>
              <div className="overflow-y-auto px-4" style={{ maxHeight: '52vh', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
                {tabPanel}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1 px-2 py-2">
            {(['type', 'text', 'position', 'bg', 'brand'] as const).map((t) => (
              <button key={t} type="button" data-testid={`tab-${t}`} onClick={() => { setTrashForId(null); setTab((p) => (p === t ? null : t)); }}
                className={['flex min-h-11 w-full min-w-0 flex-col items-center justify-center rounded-[10px] px-2 py-2', tab === t ? 'bg-[#eef1ff]' : 'bg-transparent'].join(' ')}>
                <LabTabIcon tab={t} active={tab === t} />
                <span className={tab === t ? 'text-[10px] font-medium text-[#4a6cf7]' : 'text-[10px] font-normal text-[#555]'}>{tabLabel(t)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <LabExportOverlay
        open={exportOpen}
        isGenerating={exportBusy}
        hasGenerated={exportGenerated}
        generatedImages={exportImages}
        generatingIndex={exportGenIndex}
        doneMask={exportDone}
        errorMessage={exportError}
        onDownloadAll={onDownloadAll}
        onShareAll={onShareAll}
        onSaveOne={onSaveOne}
        onShareOne={onShareOne}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
