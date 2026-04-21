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
import {
  restrictToHorizontalAxis,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  GripVertical,
  Loader2,
  Move,
  Plus,
} from 'lucide-react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/carousel/carouselConstants';
import type { Slide } from '@/lib/carouselTypes';
import type { BrandSettings } from '@/lib/brand';
import { normalizeHex } from '@/lib/brand';
import type { BrandFont } from '@/lib/brandFonts';
import CarouselSlidePreview from '@/components/carousel/CarouselSlidePreview';
import CarouselEditorTextTab from '@/components/carousel/CarouselEditorTextTab';
import CarouselEditorBackgroundTab from '@/components/carousel/CarouselEditorBackgroundTab';
import CarouselEditorStyleTab from '@/components/carousel/CarouselEditorStyleTab';
import TextAlignToggle from '@/components/carousel/TextAlignToggle';
import PlacementToggle from '@/components/carousel/PlacementToggle';
import {
  DEFAULT_BG_PHOTO_TRANSFORM,
  getBgPhotoTransform,
  normalizeBgPhotoTransform,
  zoomAroundPoint,
  type BgPhotoTransform,
} from '@/lib/carousel/bgPhotoTransform';

type EditorTab = 'type' | 'text' | 'position' | 'bg' | 'style';
const MOBILE_EDITOR_BAR_HEIGHT_PX = 72;

function SortableThumb({
  slide,
  index,
  active,
  accentColor,
  onSelect,
  size,
  brandSettings,
  brandFont,
  totalSlides,
}: {
  slide: Slide;
  index: number;
  active: boolean;
  accentColor: string;
  onSelect: () => void;
  size: 'sm' | 'md';
  brandSettings: BrandSettings;
  brandFont: BrandFont;
  totalSlides: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const thumbHeight = size === 'sm' ? 58 : 78;
  const thumbWidth = Math.round((thumbHeight * CANVAS_WIDTH) / CANVAS_HEIGHT);
  const thumbScale = Math.min(thumbWidth / CANVAS_WIDTH, thumbHeight / CANVAS_HEIGHT);

  return (
    <button
      ref={setNodeRef}
      style={{ ...style, width: thumbWidth, height: thumbHeight }}
      type="button"
      onClick={onSelect}
      className={[
        'relative shrink-0 overflow-hidden rounded-md transition-[border-color] duration-150 ease-out',
        active ? 'ring-2' : 'ring-1 ring-black/10',
      ].join(' ')}
      aria-label={`Слайд ${index + 1}`}
      aria-current={active ? 'true' : undefined}
    >
      <span className="absolute inset-0 overflow-hidden rounded-md">
        <CarouselSlidePreview
          slide={slide}
          brand={brandSettings}
          brandFont={brandFont}
          scale={thumbScale}
          slideIndex={index + 1}
          totalSlides={totalSlides}
        />
      </span>
      <span
        className="pointer-events-none absolute inset-0"
        style={{ borderRadius: 6, border: active ? `2px solid ${accentColor}` : '1px solid rgba(0,0,0,0.08)' }}
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
  validationError: string | null;
}) {
  const [tab, setTab] = useState<EditorTab | null>(null);
  /** One bottom editor UI (tabs + panels + download): avoid duplicating form fields in the DOM. */
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.28);

  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  );
  const mobileChromeRef = useRef<HTMLDivElement>(null);
  const [mobileChromeHeight, setMobileChromeHeight] = useState(MOBILE_EDITOR_BAR_HEIGHT_PX);

  /** Horizontal swipe state for the mobile preview.
   *  `swipeX` is the live pixel offset of the preview strip during a touch-drag.
   *  `swipeSettling` is true while the CSS transition animates to the final position;
   *  during settling we lock out new touches and commit the new active slide on end. */
  const [swipeX, setSwipeX] = useState(0);
  const [swipeSettling, setSwipeSettling] = useState(false);
  const swipeRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    width: number;
    dx: number;
    axisLocked: 'x' | 'y' | null;
  }>({ active: false, startX: 0, startY: 0, width: 0, dx: 0, axisLocked: null });

  const activeIndex = Math.max(
    0,
    slides.findIndex((s) => s.id === activeSlideId),
  );
  const activeSlide = slides[activeIndex] ?? slides[0];
  const panelOpen = tab !== null;
  const styleTabDisabled = Boolean(activeSlide) && activeSlide.backgroundType !== 'image';
  const hasActivePhoto =
    Boolean(activeSlide) &&
    activeSlide.backgroundType === 'image' &&
    Boolean(activeSlide.backgroundImageUrl || activeSlide.backgroundImageBase64);
  const [mobilePositioningMode, setMobilePositioningMode] = useState(false);
  const [showPhotoHint, setShowPhotoHint] = useState(false);
  const [isPhotoInteracting, setIsPhotoInteracting] = useState(false);
  const [livePhotoTransform, setLivePhotoTransform] = useState<BgPhotoTransform | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initial: BgPhotoTransform;
  } | null>(null);
  const pinchRef = useRef<{
    initialDistance: number;
    initialScale: number;
    initial: BgPhotoTransform;
    pointerA: number;
    pointerB: number;
  } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const canDownload = useMemo(() => slides.some((s) => Boolean(s.generatedImageBase64)), [slides]);

  useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setIsDesktopLayout(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!isDesktopLayout || tab !== null) return;
    const timer = window.setTimeout(() => setTab('text'), 0);
    return () => window.clearTimeout(timer);
  }, [isDesktopLayout, tab]);

  useEffect(() => {
    if (tab !== 'style' || !styleTabDisabled) return;
    const timer = window.setTimeout(() => setTab(null), 0);
    return () => window.clearTimeout(timer);
  }, [tab, styleTabDisabled]);

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (isDesktopLayout || !panelOpen) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isDesktopLayout, panelOpen]);

  useLayoutEffect(() => {
    const el = previewAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      // Skip transient 0×0 frames so we don't stick at the 0.12 floor.
      if (w < 48 || h < 48) return;
      const s = Math.min(w / CANVAS_WIDTH, h / CANVAS_HEIGHT);
      setPreviewScale(Math.max(0.12, s * 0.96));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (isDesktopLayout) return;
    const el = mobileChromeRef.current;
    if (!el) return;
    const update = () => setMobileChromeHeight(el.getBoundingClientRect().height || MOBILE_EDITOR_BAR_HEIGHT_PX);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [isDesktopLayout, tab, viewportHeight, slides.length, activeSlideId]);

  const desktopScale = useMemo(() => Math.min(480 / CANVAS_WIDTH, 600 / CANVAS_HEIGHT), []);

  const goSlide = useCallback(
    (delta: number) => {
      const next = activeIndex + delta;
      if (next < 0 || next >= slides.length) return;
      setMobilePositioningMode(false);
      setIsPhotoInteracting(false);
      setLivePhotoTransform(null);
      dragRef.current = null;
      pinchRef.current = null;
      activePointersRef.current.clear();
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

  const prevSlide = activeIndex > 0 ? slides[activeIndex - 1] : null;
  const nextSlide = activeIndex < slides.length - 1 ? slides[activeIndex + 1] : null;
  const effectivePhotoTransform =
    isPhotoInteracting && livePhotoTransform
      ? livePhotoTransform
      : activeSlide
        ? getBgPhotoTransform(activeSlide.bgPhotoTransform)
        : DEFAULT_BG_PHOTO_TRANSFORM;

  const commitPhotoTransform = useCallback(
    (next: BgPhotoTransform) => {
      if (!activeSlide || !hasActivePhoto) return;
      updateSlide(activeSlide.id, { bgPhotoTransform: normalizeBgPhotoTransform(next) });
    },
    [activeSlide, hasActivePhoto, updateSlide],
  );

  const nudgePhoto = useCallback(
    (dxFrac: number, dyFrac: number) => {
      if (!activeSlide || !hasActivePhoto) return;
      const base = livePhotoTransform ?? getBgPhotoTransform(activeSlide.bgPhotoTransform);
      const next = normalizeBgPhotoTransform({
        ...base,
        offset_x: base.offset_x + dxFrac,
        offset_y: base.offset_y + dyFrac,
      });
      setLivePhotoTransform(next);
      commitPhotoTransform(next);
    },
    [activeSlide, hasActivePhoto, livePhotoTransform, commitPhotoTransform],
  );

  const onPreviewTouchStart = (e: React.TouchEvent) => {
    if (mobilePositioningMode) return;
    if (swipeSettling) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const node = previewAreaRef.current;
    swipeRef.current = {
      active: true,
      startX: t.clientX,
      startY: t.clientY,
      width: node?.clientWidth ?? 320,
      dx: 0,
      axisLocked: null,
    };
  };

  const onPreviewTouchMove = (e: React.TouchEvent) => {
    if (mobilePositioningMode) return;
    const s = swipeRef.current;
    if (!s.active) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;

    // Lock the gesture to an axis once movement is meaningful, so vertical
    // scrolls inside the preview area don't fight the swipe.
    if (!s.axisLocked) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        s.axisLocked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
    }
    if (s.axisLocked !== 'x') return;

    let effective = dx;
    // Rubber-band resistance when swiping past the first/last slide.
    if ((dx > 0 && activeIndex === 0) || (dx < 0 && activeIndex === slides.length - 1)) {
      effective = dx * 0.28;
    }
    // Keep within ±width so neighbours don't travel further than their slot.
    const w = s.width;
    effective = Math.max(-w, Math.min(w, effective));
    s.dx = effective;
    setSwipeX(effective);
  };

  const onPreviewTouchEnd = () => {
    if (mobilePositioningMode) return;
    const s = swipeRef.current;
    if (!s.active) return;
    s.active = false;
    if (s.axisLocked !== 'x') {
      setSwipeX(0);
      return;
    }
    const { dx, width } = s;
    const threshold = Math.min(70, width * 0.22);

    if (dx > threshold && prevSlide) {
      setSwipeSettling(true);
      setSwipeX(width);
    } else if (dx < -threshold && nextSlide) {
      setSwipeSettling(true);
      setSwipeX(-width);
    } else {
      setSwipeSettling(true);
      setSwipeX(0);
    }
  };

  const onPreviewSwipeTransitionEnd = () => {
    if (!swipeSettling) return;
    const w = swipeRef.current.width;
    // When the strip has come to rest at ±w we commit the neighbour as active.
    if (swipeX >= w - 0.5 && prevSlide) {
      setActiveSlideId(prevSlide.id);
    } else if (swipeX <= -w + 0.5 && nextSlide) {
      setActiveSlideId(nextSlide.id);
    }
    setSwipeSettling(false);
    setSwipeX(0);
  };

  const mobileOpenPreviewHeightPx = Math.max(160, Math.round(viewportHeight * 0.3));

  const mobilePreviewScale = previewScale;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dragModifiers = useMemo(
    () => [isDesktopLayout ? restrictToVerticalAxis : restrictToHorizontalAxis],
    [isDesktopLayout],
  );

  const tabLabel = (t: EditorTab) =>
    t === 'type' ? 'Тип' : t === 'text' ? 'Текст' : t === 'position' ? 'Позиція' : t === 'bg' ? 'Фон' : 'Стиль';
  const getTextColorChoices = useCallback(
    (slide: Slide) => {
      if (slide.backgroundType === 'color') {
        return brandColorOptions.filter(
          (color) => normalizeHex(color) !== normalizeHex(slide.backgroundColor),
        );
      }
      if (slide.overlayType === 'frost' || slide.overlayType === 'gradient') return brandColorOptions;
      return brandColorOptions.filter(
        (color) => normalizeHex(color) !== normalizeHex(slide.overlayColor),
      );
    },
    [brandColorOptions],
  );

  const onMobilePhotoUploadSuccess = useCallback(() => {
    if (isDesktopLayout) return;
    setLivePhotoTransform(null);
    setIsPhotoInteracting(false);
    dragRef.current = null;
    pinchRef.current = null;
    activePointersRef.current.clear();
    setTab(null);
    setMobilePositioningMode(true);
    try {
      const seen = localStorage.getItem('ruta_photo_hint_seen');
      if (!seen) {
        localStorage.setItem('ruta_photo_hint_seen', '1');
        setShowPhotoHint(true);
        window.setTimeout(() => setShowPhotoHint(false), 3000);
      }
    } catch {
      // Ignore localStorage edge cases.
    }
  }, [isDesktopLayout]);

  const desktopTabButtons = (
    <div className="flex shrink-0 border-b border-[color:var(--border)]">
      {(['text', 'bg', 'style'] as const).map((t) => (
        (() => {
          const disabled = t === 'style' && styleTabDisabled;
          return (
        <button
          key={t}
          type="button"
          onClick={() => {
            if (disabled) return;
            setTab(t);
          }}
          className={[
            'flex-1 px-2 py-3 text-center text-xs font-medium transition md:py-2.5',
            disabled ? 'cursor-not-allowed opacity-40' : '',
            tab === t
              ? 'border-b-2 border-[color:var(--accent)] text-[color:var(--accent)]'
              : 'text-zinc-500 hover:text-zinc-800 md:hover:text-zinc-800',
          ].join(' ')}
        >
          {tabLabel(t)}
        </button>
          );
        })()
      ))}
    </div>
  );

  const desktopTabPanelScroll = (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-10 md:pb-3">
      {tab === 'text' && activeSlide ? (
        <CarouselEditorTextTab
          slide={activeSlide}
          index={activeIndex}
          totalSlides={slides.length}
          accentStyle={accentStyle}
          accentColor={accentColor}
          onChange={updateSlide}
          onRemoveSlide={removeSlide}
          textColorChoices={getTextColorChoices(activeSlide)}
        />
      ) : null}
      {tab === 'bg' && activeSlide ? (
        <CarouselEditorBackgroundTab
          slide={activeSlide}
          brandColorOptions={brandColorOptions}
          brandVibe={brandSettings.vibe}
          getAutoTextColors={getAutoTextColors}
          onChange={updateSlide}
          onUnsplash={onUnsplash}
          onPhotoUploadSuccess={onMobilePhotoUploadSuccess}
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

  const mobilePanelContent = activeSlide ? (
    tab === 'type' ? (
      <MobileTypeTab slide={activeSlide} onChange={updateSlide} />
    ) : tab === 'text' ? (
      <CarouselEditorTextTab
        slide={activeSlide}
        index={activeIndex}
        totalSlides={slides.length}
        accentStyle={accentStyle}
        accentColor={accentColor}
        onChange={updateSlide}
        onRemoveSlide={removeSlide}
        textColorChoices={getTextColorChoices(activeSlide)}
        showStructureControls={false}
        showPositionControls={false}
      />
    ) : tab === 'position' ? (
      activeSlide.slideType === 'cover' ? (
        <p className="text-sm text-zinc-500">Обкладинка завжди по центру.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs text-zinc-600">Розташування тексту</p>
            <PlacementToggle value={activeSlide.placement} onChange={(p) => updateSlide(activeSlide.id, { placement: p })} />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-xs text-zinc-600">Вирівнювання</p>
            <TextAlignToggle value={activeSlide.textAlign} onChange={(a) => updateSlide(activeSlide.id, { textAlign: a })} />
          </div>
        </div>
      )
    ) : tab === 'bg' ? (
      <CarouselEditorBackgroundTab
        slide={activeSlide}
        brandColorOptions={brandColorOptions}
        brandVibe={brandSettings.vibe}
        getAutoTextColors={getAutoTextColors}
        onChange={updateSlide}
        onUnsplash={onUnsplash}
        onPhotoUploadSuccess={onMobilePhotoUploadSuccess}
      />
    ) : tab === 'style' ? (
      !styleTabDisabled ? (
        <MobileOverlayStyleTab slide={activeSlide} onChange={updateSlide} />
      ) : (
        null
      )
    ) : null
  ) : null;

  const startPhotoDrag = (clientX: number, clientY: number, pointerId: number) => {
    if (!activeSlide || !hasActivePhoto) return;
    setIsPhotoInteracting(true);
    const current = livePhotoTransform ?? getBgPhotoTransform(activeSlide.bgPhotoTransform);
    setLivePhotoTransform(current);
    dragRef.current = {
      pointerId,
      startX: clientX,
      startY: clientY,
      initial: current,
    };
  };

  const onPhotoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeSlide || !hasActivePhoto) return;
    if (!isDesktopLayout && !mobilePositioningMode) return;
    if (showPhotoHint) setShowPhotoHint(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size >= 2) {
      const points = Array.from(activePointersRef.current.entries()).slice(0, 2);
      const a = points[0][1];
      const b = points[1][1];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      pinchRef.current = {
        initialDistance: Math.max(distance, 1),
        initialScale: (livePhotoTransform ?? getBgPhotoTransform(activeSlide.bgPhotoTransform)).scale,
        initial: livePhotoTransform ?? getBgPhotoTransform(activeSlide.bgPhotoTransform),
        pointerA: points[0][0],
        pointerB: points[1][0],
      };
      setIsPhotoInteracting(true);
      return;
    }

    startPhotoDrag(e.clientX, e.clientY, e.pointerId);
  };

  const onPhotoPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeSlide || !hasActivePhoto) return;
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const frameRect = e.currentTarget.getBoundingClientRect();
    const frameW = frameRect.width || 1;
    const frameH = frameRect.height || 1;

    if (pinchRef.current) {
      const p = pinchRef.current;
      const a = activePointersRef.current.get(p.pointerA);
      const b = activePointersRef.current.get(p.pointerB);
      if (!a || !b) return;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const ratio = Math.max(0.2, distance / p.initialDistance);
      const centerX = (a.x + b.x) / 2 - frameRect.left - frameW / 2;
      const centerY = (a.y + b.y) / 2 - frameRect.top - frameH / 2;
      const next = zoomAroundPoint(p.initial, p.initialScale * ratio, centerX, centerY, frameW, frameH);
      setLivePhotoTransform(next);
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const next = normalizeBgPhotoTransform({
      ...drag.initial,
      offset_x: drag.initial.offset_x + dx / frameW,
      offset_y: drag.initial.offset_y + dy / frameH,
    });
    setLivePhotoTransform(next);
  };

  const finishPhotoInteraction = () => {
    if (livePhotoTransform && activeSlide && hasActivePhoto) commitPhotoTransform(livePhotoTransform);
    setIsPhotoInteracting(false);
    dragRef.current = null;
    pinchRef.current = null;
    activePointersRef.current.clear();
  };

  const onPhotoPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;
    if (activePointersRef.current.size === 0) finishPhotoInteraction();
  };

  const onPhotoWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!activeSlide || !hasActivePhoto || !isDesktopLayout) return;
    e.preventDefault();
    const frameRect = e.currentTarget.getBoundingClientRect();
    const speed = e.shiftKey ? 0.003 : 0.001;
    const nextScale = (livePhotoTransform ?? getBgPhotoTransform(activeSlide.bgPhotoTransform)).scale - e.deltaY * speed;
    const px = e.clientX - frameRect.left - frameRect.width / 2;
    const py = e.clientY - frameRect.top - frameRect.height / 2;
    const next = zoomAroundPoint(
      livePhotoTransform ?? getBgPhotoTransform(activeSlide.bgPhotoTransform),
      nextScale,
      px,
      py,
      frameRect.width || 1,
      frameRect.height || 1,
    );
    setLivePhotoTransform(next);
    commitPhotoTransform(next);
  };

  const onPhotoLayerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasActivePhoto) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nudgePhoto(-step, 0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nudgePhoto(step, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nudgePhoto(0, -step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nudgePhoto(0, step);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      const base = livePhotoTransform ?? getBgPhotoTransform(activeSlide?.bgPhotoTransform);
      const next = zoomAroundPoint(base, base.scale + 0.05, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      setLivePhotoTransform(next);
      commitPhotoTransform(next);
    } else if (e.key === '-') {
      e.preventDefault();
      const base = livePhotoTransform ?? getBgPhotoTransform(activeSlide?.bgPhotoTransform);
      const next = zoomAroundPoint(base, base.scale - 0.05, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      setLivePhotoTransform(next);
      commitPhotoTransform(next);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mobile top bar */}
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[color:var(--border)] px-3 md:hidden">
        <Link
          href="/carousel"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-sm font-medium text-zinc-800"
          aria-label="Всі каруселі"
        >
          <ChevronLeft className="h-5 w-5" />
          <span>Всі каруселі</span>
        </Link>
        <p className="text-sm font-medium text-zinc-800">Слайд {activeIndex + 1} / {slides.length}</p>
        <div className="flex items-center gap-1 md:hidden">
          <button
            type="button"
            onClick={hasGenerated ? onDownloadAll : onGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-900 disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Завантажити
          </button>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col md:min-h-0"
        style={
          isDesktopLayout
            ? undefined
            : {
                paddingBottom: mobileChromeHeight,
                transition: 'padding-bottom 250ms ease',
              }
        }
      >
        <div className="flex min-h-0 flex-1 flex-col md:flex-row md:justify-center md:gap-4 md:px-4 md:pt-0 md:pb-2">
        {/* Preview column — first on mobile */}
        <div className="order-1 flex min-h-0 w-full flex-1 flex-col items-center md:order-1 md:max-w-[min(100%,520px)]">
          <div
            className={[
              'relative flex h-full w-full flex-1 flex-col items-center justify-center md:min-h-[min(520px,70vh)]',
              !isDesktopLayout && !panelOpen
                ? 'min-h-[max(260px,min(62vh,calc(100dvh-52px-200px)))]'
                : '',
              !isDesktopLayout && panelOpen ? 'min-h-[220px]' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div
              ref={previewAreaRef}
              className="relative flex h-full w-full max-w-[min(100vw,520px)] items-center justify-center overflow-hidden md:hidden"
              onClick={(e) => {
                if (!mobilePositioningMode) return;
                if (e.target === e.currentTarget) {
                  finishPhotoInteraction();
                  setMobilePositioningMode(false);
                }
              }}
              onTouchStart={onPreviewTouchStart}
              onTouchMove={onPreviewTouchMove}
              onTouchEnd={onPreviewTouchEnd}
              onTouchCancel={onPreviewTouchEnd}
            >
              <div
                className="relative flex h-full w-full items-center justify-center"
                style={{
                  transform: `translate3d(${swipeX}px, 0, 0)`,
                  transition: swipeSettling
                    ? 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)'
                    : 'none',
                  willChange: 'transform',
                }}
                onTransitionEnd={(e) => {
                  if (e.propertyName !== 'transform') return;
                  onPreviewSwipeTransitionEnd();
                }}
              >
                {prevSlide ? (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    style={{ transform: 'translate3d(-100%, 0, 0)' }}
                    aria-hidden
                  >
                    <CarouselSlidePreview
                      slide={prevSlide}
                      brand={brandSettings}
                      brandFont={brandFont}
                      scale={mobilePreviewScale}
                      slideIndex={activeIndex}
                      totalSlides={slides.length}
                    />
                  </div>
                ) : null}
                {activeSlide ? (
                  <div
                    className="relative"
                    style={
                      !isDesktopLayout && panelOpen
                        ? {
                            width: `${Math.round((mobileOpenPreviewHeightPx * CANVAS_WIDTH) / CANVAS_HEIGHT)}px`,
                            maxWidth: '70vw',
                          }
                        : undefined
                    }
                    onClick={() => {
                      if (!isDesktopLayout && hasActivePhoto && !mobilePositioningMode) {
                        setMobilePositioningMode(true);
                        if (showPhotoHint) setShowPhotoHint(false);
                      }
                    }}
                  >
                    <CarouselSlidePreview
                      slide={activeSlide}
                      brand={brandSettings}
                      brandFont={brandFont}
                      scale={mobilePreviewScale}
                      slideIndex={activeIndex + 1}
                      totalSlides={slides.length}
                      photoTransformOverride={effectivePhotoTransform}
                      isInteractingPhoto={isPhotoInteracting}
                      mobilePositioningMode={mobilePositioningMode && !isDesktopLayout}
                    />
                    {hasActivePhoto ? (
                      <div
                        className="absolute inset-0 touch-none"
                        style={{ cursor: isDesktopLayout ? (isPhotoInteracting ? 'grabbing' : 'grab') : 'default' }}
                        tabIndex={0}
                        onPointerDown={onPhotoPointerDown}
                        onPointerMove={onPhotoPointerMove}
                        onPointerUp={onPhotoPointerUp}
                        onPointerCancel={onPhotoPointerUp}
                        onWheel={onPhotoWheel}
                        onKeyDown={onPhotoLayerKeyDown}
                        role={mobilePositioningMode && !isDesktopLayout ? 'img' : undefined}
                        aria-label={
                          mobilePositioningMode && !isDesktopLayout
                            ? 'Фон слайду — перетягни щоб розташувати'
                            : undefined
                        }
                      />
                    ) : null}
                    {hasActivePhoto ? (
                      <button
                        type="button"
                        aria-label="Розташувати фото"
                        className="absolute right-2 top-2 z-[4] flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white shadow-[0_2px_8px_rgba(0,0,0,0.28)] transition-opacity"
                        style={{ opacity: mobilePositioningMode ? 0 : 1 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMobilePositioningMode(true);
                          if (showPhotoHint) setShowPhotoHint(false);
                        }}
                      >
                        <Move className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {nextSlide ? (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    style={{ transform: 'translate3d(100%, 0, 0)' }}
                    aria-hidden
                  >
                    <CarouselSlidePreview
                      slide={nextSlide}
                      brand={brandSettings}
                      brandFont={brandFont}
                      scale={mobilePreviewScale}
                      slideIndex={activeIndex + 2}
                      totalSlides={slides.length}
                    />
                  </div>
                ) : null}
              </div>
            </div>
            {showPhotoHint && hasActivePhoto && mobilePositioningMode && !isDesktopLayout ? (
              <div className="pointer-events-none absolute top-3 left-1/2 z-[6] -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
                Тягни фото щоб розташувати
              </div>
            ) : null}
            {mobilePositioningMode && !isDesktopLayout ? (
              <button
                type="button"
                className="absolute bottom-3 left-1/2 z-[5] min-h-11 min-w-11 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow"
                onClick={() => {
                  finishPhotoInteraction();
                  setMobilePositioningMode(false);
                }}
              >
                Готово
              </button>
            ) : null}

            <div className="relative mx-auto hidden overflow-hidden rounded-xl shadow-lg md:block" style={{ width: 480, height: 600 }}>
              {activeSlide ? (
                <div className="relative">
                  <CarouselSlidePreview
                    slide={activeSlide}
                    brand={brandSettings}
                    brandFont={brandFont}
                    scale={desktopScale}
                    slideIndex={activeIndex + 1}
                    totalSlides={slides.length}
                    photoTransformOverride={effectivePhotoTransform}
                    isInteractingPhoto={isPhotoInteracting}
                  />
                  {hasActivePhoto ? (
                    <div
                      className="absolute inset-0 touch-none"
                      style={{ cursor: isPhotoInteracting ? 'grabbing' : 'grab' }}
                      tabIndex={0}
                      onPointerDown={onPhotoPointerDown}
                      onPointerMove={onPhotoPointerMove}
                      onPointerUp={onPhotoPointerUp}
                      onPointerCancel={onPhotoPointerUp}
                      onWheel={onPhotoWheel}
                      onKeyDown={onPhotoLayerKeyDown}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="absolute top-1/2 z-[2] hidden -translate-y-1/2 rounded-full border border-[color:var(--border)] bg-white/90 p-2 shadow md:-left-12 md:block"
              onClick={() => goSlide(-1)}
              disabled={activeIndex <= 0}
              aria-label="Попередній слайд"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="absolute top-1/2 z-[2] hidden -translate-y-1/2 rounded-full border border-[color:var(--border)] bg-white/90 p-2 shadow md:-right-12 md:block"
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

        {isDesktopLayout ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            modifiers={dragModifiers}
          >
            <SortableContext items={slides.map((s) => s.id)} strategy={rectSortingStrategy}>
              <div className="order-2 flex shrink-0 flex-row items-center gap-2 overflow-x-auto px-3 py-2 md:order-2 md:w-[72px] md:flex-col md:overflow-y-auto md:px-1 md:py-0">
                {slides.map((slide, index) => (
                  <SortableThumb
                    key={slide.id}
                    slide={slide}
                    index={index}
                    active={slide.id === activeSlideId}
                    accentColor={accentColor}
                    onSelect={() => {
                      setMobilePositioningMode(false);
                      setIsPhotoInteracting(false);
                      setLivePhotoTransform(null);
                      dragRef.current = null;
                      pinchRef.current = null;
                      activePointersRef.current.clear();
                      setActiveSlideId(slide.id);
                    }}
                    size={isDesktopLayout ? 'md' : 'sm'}
                    brandSettings={brandSettings}
                    brandFont={brandFont}
                    totalSlides={slides.length}
                  />
                ))}
                <button
                  type="button"
                  onClick={addSlide}
                  className="flex h-[58px] w-[46px] shrink-0 items-center justify-center rounded-md border border-dashed border-[color:var(--border)] text-zinc-500 hover:bg-[color:var(--surface)] md:h-[78px] md:w-[62px]"
                  aria-label="Додати слайд"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </SortableContext>
          </DndContext>
        ) : null}

        {isDesktopLayout ? (
          <div className="hidden min-h-0 w-[360px] max-w-[38vw] shrink-0 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] md:flex md:flex-col">
            {desktopTabButtons}
            {desktopTabPanelScroll}
          </div>
        ) : null}
        </div>
      </div>

      {!isDesktopLayout ? (
        <div
          ref={mobileChromeRef}
          className="fixed bottom-0 left-0 right-0 z-40 bg-white"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {!panelOpen ? (
            <div
              className="border-t"
              style={{ borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.06)' }}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
                modifiers={dragModifiers}
              >
                <SortableContext items={slides.map((s) => s.id)} strategy={rectSortingStrategy}>
                  <div className="flex shrink-0 flex-row items-center gap-2 overflow-x-auto px-3 py-2">
                    {slides.map((slide, index) => (
                      <SortableThumb
                        key={slide.id}
                        slide={slide}
                        index={index}
                        active={slide.id === activeSlideId}
                        accentColor={accentColor}
                        onSelect={() => {
                          setMobilePositioningMode(false);
                          setIsPhotoInteracting(false);
                          setLivePhotoTransform(null);
                          dragRef.current = null;
                          pinchRef.current = null;
                          activePointersRef.current.clear();
                          setActiveSlideId(slide.id);
                        }}
                        size="sm"
                        brandSettings={brandSettings}
                        brandFont={brandFont}
                        totalSlides={slides.length}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={addSlide}
                      className="flex h-[58px] w-[46px] shrink-0 items-center justify-center rounded-md border border-dashed border-[color:var(--border)] text-zinc-500 hover:bg-[color:var(--surface)]"
                      aria-label="Додати слайд"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ) : null}
          <div
            className="overflow-hidden transition-[max-height] duration-250 ease-in-out"
            style={{ maxHeight: panelOpen ? viewportHeight * 0.55 : 0 }}
          >
            <div
              className="overflow-y-auto px-4 pt-5"
              style={{
                maxHeight: '55vh',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
              }}
            >
              {mobilePanelContent}
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(['type', 'text', 'position', 'bg', 'style'] as const).map((t) => (
              (() => {
                const disabled = t === 'style' && styleTabDisabled;
                return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  if (disabled) return;
                  setTab((prev) => (prev === t ? null : t));
                }}
                className={[
                  'flex min-h-11 min-w-16 shrink-0 flex-col items-center justify-center rounded-[10px] px-3 py-2',
                  disabled ? 'cursor-not-allowed pointer-events-none opacity-40' : '',
                  tab === t ? 'bg-[#eef1ff]' : 'bg-transparent',
                ].join(' ')}
              >
                <MobileTabIcon tab={t} active={tab === t} />
                <span className={tab === t ? 'text-[10px] font-medium text-[#4a6cf7]' : 'text-[10px] font-normal text-[#555]'}>
                  {tabLabel(t)}
                </span>
              </button>
                );
              })()
            ))}
          </div>
        </div>
      ) : null}

      {validationError ? (
        <p className="px-3 pb-2 text-sm text-red-600 md:px-4" role="alert">
          {validationError}
        </p>
      ) : null}
    </div>
  );
}

function MobileTypeTab({
  slide,
  onChange,
}: {
  slide: Slide;
  onChange: (id: string, patch: Partial<Slide>) => void;
}) {
  const slideType = slide.slideType ?? 'slide';
  const preset = slide.layoutPreset ?? (slideType === 'final' ? 'goal' : 'text');
  const types: Array<{ id: 'cover' | 'slide' | 'final'; label: string }> = [
    { id: 'cover', label: 'Обкладинка' },
    { id: 'slide', label: 'Слайд' },
    { id: 'final', label: 'Фінал' },
  ];
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              onChange(slide.id, {
                slideType: t.id,
                layoutPreset: t.id === 'cover' ? null : t.id === 'final' ? 'goal' : 'text',
              })
            }
            className={slideType === t.id ? 'rounded-full border border-[#4a6cf7] bg-[#eef1ff] px-3 py-1.5 text-xs font-medium text-[#4a6cf7]' : 'rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs text-zinc-700'}
          >
            {t.label}
          </button>
        ))}
      </div>
      {slideType === 'slide' ? (
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            ['text', 'Текст'],
            ['quote', 'Цитата'],
            ['testimonial', 'Відгук'],
            ['list', 'Список'],
          ].map(([id, label]) => (
            <button key={id} type="button" onClick={() => onChange(slide.id, { layoutPreset: id as Slide['layoutPreset'] })} className={preset === id ? 'rounded-full border border-[#4a6cf7] bg-[#eef1ff] px-3 py-1.5 text-xs font-medium text-[#4a6cf7]' : 'rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs text-zinc-700'}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {slideType === 'final' ? (
        <div className="flex gap-2">
          {[
            ['goal', 'Ціль'],
            ['reaction', 'Реакція'],
          ].map(([id, label]) => (
            <button key={id} type="button" onClick={() => onChange(slide.id, { layoutPreset: id as Slide['layoutPreset'] })} className={preset === id ? 'rounded-full border border-[#4a6cf7] bg-[#eef1ff] px-3 py-1.5 text-xs font-medium text-[#4a6cf7]' : 'rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs text-zinc-700'}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MobileOverlayStyleTab({
  slide,
  onChange,
}: {
  slide: Slide;
  onChange: (id: string, patch: Partial<Slide>) => void;
}) {
  const opts: Array<{ id: NonNullable<Slide['overlayType']>; label: string }> = [
    { id: 'full', label: 'Повний' },
    { id: 'gradient', label: 'Градієнт' },
    { id: 'frost', label: 'Фрост' },
  ];
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {opts.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(slide.id, { overlayType: o.id })} className={slide.overlayType === o.id ? 'rounded-full border border-[#4a6cf7] bg-[#eef1ff] px-3 py-1.5 text-xs font-medium text-[#4a6cf7]' : 'rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs text-zinc-700'}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileTabIcon({ tab, active }: { tab: EditorTab; active: boolean }) {
  const stroke = active ? '#4a6cf7' : '#555';
  if (tab === 'type') return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2" stroke={stroke} strokeWidth="1.6"/><path d="M4 9h16" stroke={stroke} strokeWidth="1.6"/></svg>;
  if (tab === 'text') return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6h12M12 6v12" stroke={stroke} strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (tab === 'position') return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M7 12h10M9 17h6" stroke={stroke} strokeWidth="1.6" strokeLinecap="round"/></svg>;
  if (tab === 'bg') return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2" stroke={stroke} strokeWidth="1.6"/><circle cx="9" cy="10" r="1.5" stroke={stroke} strokeWidth="1.6"/><path d="M7 17l10-8" stroke={stroke} strokeWidth="1.6"/></svg>;
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 4a8 8 0 1 1 0 16V4z" stroke={stroke} strokeWidth="1.6"/><circle cx="12" cy="12" r="8" stroke={stroke} strokeWidth="1.6"/></svg>;
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
