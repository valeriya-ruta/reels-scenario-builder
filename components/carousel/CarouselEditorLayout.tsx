'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import Link from 'next/link';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  GripVertical,
  Loader2,
  Plus,
  Share2,
} from 'lucide-react';
import { CANVAS_SIZE } from '@/lib/carousel/carouselConstants';
import type { Slide } from '@/lib/carouselTypes';
import type { BrandSettings } from '@/lib/brand';
import { normalizeHex } from '@/lib/brand';
import type { BrandFont } from '@/lib/brandFonts';
import CarouselSlidePreview from '@/components/carousel/CarouselSlidePreview';
import CarouselEditorTextTab from '@/components/carousel/CarouselEditorTextTab';
import CarouselEditorBackgroundTab from '@/components/carousel/CarouselEditorBackgroundTab';
import CarouselEditorStyleTab from '@/components/carousel/CarouselEditorStyleTab';

type EditorTab = 'text' | 'bg' | 'style';
type SheetSnap = 'dismissed' | 'peek' | 'half';

function SortableThumb({
  slide,
  index,
  active,
  accentColor,
  onSelect,
  size,
}: {
  slide: Slide;
  index: number;
  active: boolean;
  accentColor: string;
  onSelect: () => void;
  size: 'sm' | 'md';
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const dim = size === 'sm' ? 44 : 60;
  const thumbBg =
    slide.backgroundType === 'image' && (slide.backgroundImageUrl || slide.backgroundImageBase64)
      ? {
          backgroundImage: slide.backgroundImageBase64
            ? `url(data:image/png;base64,${slide.backgroundImageBase64})`
            : `url(${slide.backgroundImageUrl})`,
          backgroundSize: 'cover' as const,
          backgroundPosition: 'center' as const,
        }
      : { backgroundColor: slide.backgroundColor };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onSelect}
      className={[
        'relative shrink-0 overflow-hidden rounded-md transition-[border-color] duration-150 ease-out',
        size === 'sm' ? 'h-11 w-11' : 'h-[60px] w-[60px]',
        active ? 'ring-2' : 'ring-1 ring-black/10',
      ].join(' ')}
      aria-label={`Слайд ${index + 1}`}
      aria-current={active ? 'true' : undefined}
    >
      <span
        className="absolute inset-0"
        style={{
          ...thumbBg,
          borderRadius: 6,
          border: active ? `2px solid ${accentColor}` : '1px solid rgba(0,0,0,0.08)',
        }}
      />
      <span
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 z-[1] flex h-full w-6 cursor-grab touch-none select-none items-center justify-center bg-gradient-to-r from-black/25 to-transparent text-white opacity-0 hover:opacity-100"
      >
        <GripVertical className="h-3 w-3" />
      </span>
    </button>
  );
}

export default function CarouselEditorLayout({
  slides,
  activeSlideId,
  setActiveSlideId,
  brandSettings,
  brandFont,
  accentStyle,
  accentColor,
  updateSlide,
  addSlide,
  removeSlide,
  onDragEnd,
  onUnsplash,
  brandColorOptions,
  getAutoTextColors,
  /** Style tab */
  accentDraft,
  onAccentDraft,
  watermarkDraft,
  onWatermarkDraft,
  /** Generation / download */
  hasGenerated,
  isGenerating,
  onGenerate,
  onDownloadAll,
  onSharePlaceholder,
  validationError,
}: {
  slides: Slide[];
  activeSlideId: string | null;
  setActiveSlideId: (id: string | null) => void;
  brandSettings: BrandSettings;
  brandFont: BrandFont;
  accentStyle: import('@/lib/brand').BrandAccentStyle;
  accentColor: string;
  updateSlide: (id: string, patch: Partial<Slide>) => void;
  addSlide: () => void;
  removeSlide: (id: string) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onUnsplash: () => void;
  brandColorOptions: string[];
  getAutoTextColors: (bg: string) => { titleColor: string; bodyColor: string };
  accentDraft: import('@/lib/brand').BrandAccentStyle;
  onAccentDraft: (a: import('@/lib/brand').BrandAccentStyle) => void;
  watermarkDraft: string;
  onWatermarkDraft: (v: string) => void;
  hasGenerated: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onDownloadAll: () => void;
  onSharePlaceholder: () => void;
  validationError: string | null;
}) {
  const [tab, setTab] = useState<EditorTab>('text');
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  /** One bottom editor UI (tabs + panels + download): avoid duplicating form fields in the DOM. */
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.28);
  const touchStartX = useRef<number | null>(null);

  const activeIndex = Math.max(
    0,
    slides.findIndex((s) => s.id === activeSlideId),
  );
  const activeSlide = slides[activeIndex] ?? slides[0];

  useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setIsDesktopLayout(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useLayoutEffect(() => {
    const el = previewAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = Math.min(w, h) / CANVAS_SIZE;
      setPreviewScale(Math.max(0.12, s * 0.96));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const desktopScale = useMemo(() => 480 / CANVAS_SIZE, []);

  const goSlide = useCallback(
    (delta: number) => {
      const next = activeIndex + delta;
      if (next < 0 || next >= slides.length) return;
      setActiveSlideId(slides[next].id);
    },
    [activeIndex, slides, setActiveSlideId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (window.matchMedia('(max-width: 767px)').matches) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goSlide(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goSlide(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goSlide]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (dx > 40) goSlide(-1);
    else if (dx < -40) goSlide(1);
  };

  const peekLeft = slides[activeIndex - 1]?.backgroundColor ?? slides[activeIndex]?.backgroundColor ?? '#ccc';
  const peekRight = slides[activeIndex + 1]?.backgroundColor ?? slides[activeIndex]?.backgroundColor ?? '#ccc';

  const sheetY = useMemo(() => {
    if (sheetSnap === 'dismissed') return 'translateY(100%)';
    if (sheetSnap === 'peek') return 'translateY(calc(100% - 56px))';
    return 'translateY(calc(100% - min(52vh, 70%)))';
  }, [sheetSnap]);

  const mobilePreviewHeight = useMemo(() => {
    if (sheetSnap === 'half') return '40vh';
    if (sheetSnap === 'dismissed') return '58vh';
    return '52vh';
  }, [sheetSnap]);

  const mobilePreviewMaxHeight = sheetSnap === 'half' ? 420 : 560;
  const mobileScaleFactor = sheetSnap === 'half' ? 0.72 : sheetSnap === 'peek' ? 0.86 : 1;
  const mobilePreviewScale = previewScale * mobileScaleFactor;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const tabLabel = (t: EditorTab) =>
    t === 'text' ? 'Текст' : t === 'bg' ? 'Фон' : 'Стиль';

  const tabButtons = (
    <div className="flex shrink-0 border-b border-[color:var(--border)]">
      {(['text', 'bg', 'style'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => {
            setTab(t);
            setSheetSnap('half');
          }}
          className={[
            'flex-1 px-2 py-3 text-center text-xs font-medium transition md:py-2.5',
            tab === t
              ? 'border-b-2 border-[color:var(--accent)] text-[color:var(--accent)]'
              : 'text-zinc-500 hover:text-zinc-800 md:hover:text-zinc-800',
          ].join(' ')}
        >
          {tabLabel(t)}
        </button>
      ))}
    </div>
  );

  const tabPanelScroll = (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {tab === 'text' && activeSlide ? (
        <CarouselEditorTextTab
          slide={activeSlide}
          index={activeIndex}
          totalSlides={slides.length}
          accentStyle={accentStyle}
          accentColor={accentColor}
          onChange={updateSlide}
          onRemoveSlide={removeSlide}
        />
      ) : null}
      {tab === 'bg' && activeSlide ? (
        <CarouselEditorBackgroundTab
          slide={activeSlide}
          brandColorOptions={brandColorOptions}
          getAutoTextColors={getAutoTextColors}
          onChange={updateSlide}
          onUnsplash={onUnsplash}
        />
      ) : null}
      {tab === 'style' ? (
        <CarouselEditorStyleTab
          brand={brandSettings}
          accentDraft={accentDraft}
          onAccentDraft={onAccentDraft}
          watermarkDraft={watermarkDraft}
          onWatermarkDraft={onWatermarkDraft}
        />
      ) : null}
    </div>
  );

  const downloadFooter = (
    <div className="shrink-0 border-t border-[color:var(--border)] bg-white px-4 py-3">
      <DownloadButton
        hasGenerated={hasGenerated}
        isGenerating={isGenerating}
        onGenerate={onGenerate}
        onDownloadAll={onDownloadAll}
      />
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mobile top bar */}
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[color:var(--border)] px-3 md:hidden">
        <Link href="/carousel" className="text-base font-semibold text-zinc-900">
          Карусель
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSharePlaceholder}
            className="rounded-lg p-2 text-zinc-600 hover:bg-[color:var(--surface)]"
            aria-label="Поділитися"
          >
            <Share2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => (hasGenerated ? onDownloadAll() : undefined)}
            disabled={!hasGenerated}
            className="rounded-lg p-2 text-zinc-600 hover:bg-[color:var(--surface)] disabled:opacity-40"
            aria-label="Завантажити"
          >
            <Download className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:min-h-0">
        <div className="flex min-h-0 flex-1 flex-col md:flex-row md:gap-4 md:px-4 md:pt-0 md:pb-2">
        {/* Preview column — first on mobile */}
        <div className="order-1 flex min-h-0 w-full flex-col items-center md:order-2 md:max-w-[min(100%,520px)]">
          <div
            className="relative flex w-full flex-col items-center justify-center md:min-h-[min(520px,70vh)]"
            style={
              isDesktopLayout
                ? undefined
                : { height: mobilePreviewHeight, maxHeight: mobilePreviewMaxHeight, minHeight: 240 }
            }
          >
            <div
              className="pointer-events-none absolute inset-y-8 left-0 w-10 scale-[0.92] opacity-40 md:hidden"
              style={{ backgroundColor: peekLeft }}
            />
            <div
              className="pointer-events-none absolute inset-y-8 right-0 w-10 scale-[0.92] opacity-40 md:hidden"
              style={{ backgroundColor: peekRight }}
            />

            <div
              ref={previewAreaRef}
              className="relative flex h-full w-full max-w-[min(100vw,520px)] items-center justify-center md:hidden"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {activeSlide ? (
                <CarouselSlidePreview
                  slide={activeSlide}
                  brand={brandSettings}
                  brandFont={brandFont}
                  scale={mobilePreviewScale}
                  slideIndex={activeIndex + 1}
                  totalSlides={slides.length}
                />
              ) : null}
            </div>

            <div className="relative mx-auto hidden overflow-hidden rounded-xl shadow-lg md:block" style={{ width: 480, height: 480 }}>
              {activeSlide ? (
                <CarouselSlidePreview
                  slide={activeSlide}
                  brand={brandSettings}
                  brandFont={brandFont}
                  scale={desktopScale}
                  slideIndex={activeIndex + 1}
                  totalSlides={slides.length}
                />
              ) : null}
            </div>

            <button
              type="button"
              className="absolute left-2 top-1/2 z-[2] hidden -translate-y-1/2 rounded-full border border-[color:var(--border)] bg-white/90 p-2 shadow md:block"
              onClick={() => goSlide(-1)}
              disabled={activeIndex <= 0}
              aria-label="Попередній слайд"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 z-[2] hidden -translate-y-1/2 rounded-full border border-[color:var(--border)] bg-white/90 p-2 shadow md:block"
              onClick={() => goSlide(1)}
              disabled={activeIndex >= slides.length - 1}
              aria-label="Наступний слайд"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <p className="mt-2 hidden text-sm text-zinc-500 md:block">
            {activeIndex + 1} / {slides.length}
          </p>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={slides.map((s) => s.id)} strategy={rectSortingStrategy}>
            <div className="order-2 flex shrink-0 flex-row gap-2 overflow-x-auto px-3 py-2 md:order-1 md:w-[72px] md:flex-col md:overflow-y-auto md:px-1 md:py-0">
              {slides.map((slide, index) => (
                <SortableThumb
                  key={slide.id}
                  slide={slide}
                  index={index}
                  active={slide.id === activeSlideId}
                  accentColor={accentColor}
                  onSelect={() => setActiveSlideId(slide.id)}
                  size="sm"
                />
              ))}
              <button
                type="button"
                onClick={addSlide}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-[color:var(--border)] text-zinc-500 hover:bg-[color:var(--surface)] md:h-[60px] md:w-[60px]"
                aria-label="Додати слайд"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </SortableContext>
        </DndContext>
        </div>

        {isDesktopLayout ? (
          <div className="flex min-h-0 w-full max-h-[min(440px,46vh)] shrink-0 flex-col overflow-hidden rounded-t-2xl border border-[color:var(--border)] bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.06)] md:mx-4 md:mb-4">
            {tabButtons}
            {tabPanelScroll}
            {downloadFooter}
          </div>
        ) : null}
      </div>

      {!isDesktopLayout ? (
        <>
          <div
            className="fixed inset-x-0 bottom-16 z-[70] max-h-[85vh]"
            style={{
              transform: sheetY,
              transition: 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            <div className="flex min-h-0 max-h-[85vh] flex-col rounded-t-2xl border border-[color:var(--border)] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
              <button
                type="button"
                className="flex h-8 w-full shrink-0 touch-none items-center justify-center pt-2"
                aria-label="Перетягнути панель"
                onClick={() => {
                  setSheetSnap((prev) => (prev === 'half' ? 'peek' : 'half'));
                }}
                onTouchStart={(e) => {
                  const startY = e.touches[0]?.clientY ?? 0;
                  let moved = false;
                  let settled = false;
                  const settle = (next: SheetSnap) => {
                    if (settled) return;
                    settled = true;
                    setSheetSnap(next);
                  };
                  const onMove = (ev: TouchEvent) => {
                    const y = ev.touches[0]?.clientY ?? startY;
                    const dy = y - startY;
                    if (Math.abs(dy) > 12) moved = true;
                    if (dy > 40) settle('peek');
                    if (dy < -40) settle('half');
                  };
                  const onEnd = () => {
                    if (!settled && moved) {
                      setSheetSnap((prev) => (prev === 'half' ? 'peek' : 'half'));
                    }
                    window.removeEventListener('touchmove', onMove);
                    window.removeEventListener('touchend', onEnd);
                  };
                  window.addEventListener('touchmove', onMove, { passive: true });
                  window.addEventListener('touchend', onEnd);
                }}
              >
                <span className="h-1 w-10 rounded-full bg-zinc-300" />
              </button>
              {tabButtons}
              {tabPanelScroll}
              {downloadFooter}
            </div>
          </div>
          <div className="h-[120px] shrink-0" aria-hidden />
        </>
      ) : null}

      {validationError ? (
        <p className="px-3 pb-2 text-sm text-red-600 md:px-4" role="alert">
          {validationError}
        </p>
      ) : null}
    </div>
  );
}

function DownloadButton({
  hasGenerated,
  isGenerating,
  onGenerate,
  onDownloadAll,
}: {
  hasGenerated: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onDownloadAll: () => void;
}) {
  if (!hasGenerated) {
    return (
      <button
        type="button"
        disabled={isGenerating}
        onClick={onGenerate}
        className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isGenerating ? 'Генеруємо…' : 'Згенерувати карусель'}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onDownloadAll}
      className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] py-3 text-sm font-medium text-white transition hover:brightness-110"
    >
      <Download className="h-4 w-4" />
      Завантажити всі
    </button>
  );
}
