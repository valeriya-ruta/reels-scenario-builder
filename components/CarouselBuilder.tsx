'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { nanoid } from 'nanoid';
import { GripVertical, Trash2, Loader2, Check, Circle, ChevronDown, ChevronRight } from 'lucide-react';
import type { Slide, SlidePlacement } from '@/lib/carouselTypes';
import { CAROUSEL_DEFAULT_BG } from '@/lib/carouselTypes';
import { useNavBadges } from '@/components/NavBadgeContext';
import { useBrandStore } from '@/components/BrandProvider';
import { normalizeHex } from '@/lib/brand';

const MAX_SLIDES = 20;
const AA_CONTRAST_MIN = 4.5;

function linearizeChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function getLuminance(hex: string): number {
  const safe = normalizeHex(hex).slice(1);
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

function getContrastRatio(foreground: string, background: string): number {
  const fgL = getLuminance(foreground);
  const bgL = getLuminance(background);
  const [hi, lo] = fgL > bgL ? [fgL, bgL] : [bgL, fgL];
  return (hi + 0.05) / (lo + 0.05);
}

function createSlide(): Slide {
  return {
    id: nanoid(),
    title: '',
    body: '',
    placement: 'center',
    backgroundType: 'color',
    backgroundColor: CAROUSEL_DEFAULT_BG,
    backgroundImageUrl: null,
    backgroundImageBase64: null,
    titleColor: '#FFFFFF',
    bodyColor: '#FFFFFF',
    generatedImageBase64: null,
  };
}

function stripDataUrlBase64(data: string): string {
  const m = data.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : data;
}

type UnsplashHit = { id: string; regular: string; thumb: string };

function UnsplashModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hits, setHits] = useState<UnsplashHit[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (q: string, p: number, append: boolean) => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/unsplash/search?${new URLSearchParams({ query: q, page: String(p) })}`
        );
        const data = (await res.json()) as {
          configured?: boolean;
          results?: UnsplashHit[];
          error?: string;
        };
        if (data.configured === false) {
          setConfigured(false);
          setHits([]);
          return;
        }
        setConfigured(true);
        if (!res.ok) {
          setErr(data.error ?? 'Помилка');
          return;
        }
        const next = data.results ?? [];
        setHits((prev) => (append ? [...prev, ...next] : next));
      } catch {
        setErr('Не вдалося завантажити');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setPage(1);
    setHits([]);
    setErr(null);
    setConfigured(true);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Закрити" onClick={onClose} />
      <div
        className="relative z-[201] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-zinc-900">Пошук зображень</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 hover:bg-[color:var(--surface)]"
            aria-label="Закрити"
          >
            ×
          </button>
        </div>
        {!configured ? (
          <p className="text-sm leading-relaxed text-zinc-600">
            Unsplash не налаштовано. Завантажте зображення вручну.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setPage(1);
                    void load(query, 1, false);
                  }
                }}
                placeholder="Ключові слова…"
                className="min-w-0 flex-1 rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
              />
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  void load(query, 1, false);
                }}
                className="shrink-0 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 active:scale-[0.97]"
              >
                Знайти
              </button>
            </div>
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {hits.map((h) => (
                <button
                  key={`${h.id}-${h.regular}`}
                  type="button"
                  onClick={() => {
                    onPick(h.regular);
                    onClose();
                  }}
                  className="overflow-hidden rounded-lg border border-[color:var(--border)] transition hover:ring-2 hover:ring-[color:var(--accent)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.thumb || h.regular} alt="" className="h-24 w-full object-cover" />
                </button>
              ))}
            </div>
            {hits.length > 0 && (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  void load(query, next, true);
                }}
                className="btn-secondary mt-4 w-full rounded-xl border border-[color:var(--border)] py-2 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)] disabled:opacity-50"
              >
                {loading ? '…' : 'Завантажити ще'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlacementToggle({
  value,
  onChange,
}: {
  value: SlidePlacement;
  onChange: (p: SlidePlacement) => void;
}) {
  const opts: { id: SlidePlacement; label: string }[] = [
    { id: 'top', label: 'Зверху' },
    { id: 'center', label: 'По центру' },
    { id: 'bottom', label: 'Знизу' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={[
            'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
            value === o.id
              ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
              : 'border-[color:var(--border)] bg-white text-zinc-700 hover:bg-[color:var(--surface)]',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SortableSlideCard({
  slide,
  index,
  onChange,
  onRemove,
  onFocus,
  setUnsplashForId,
  brandColorOptions,
  getAutoTextColors,
  isCollapsed,
  onToggleCollapse,
}: {
  slide: Slide;
  index: number;
  onChange: (id: string, patch: Partial<Slide>) => void;
  onRemove: (id: string) => void;
  onFocus: (id: string) => void;
  setUnsplashForId: (id: string | null) => void;
  brandColorOptions: string[];
  getAutoTextColors: (backgroundColor: string) => { titleColor: string; bodyColor: string };
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const fileInputId = useId();
  const availableTextColors = brandColorOptions.filter(
    (color) => normalizeHex(color) !== normalizeHex(slide.backgroundColor),
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
      onFocus={() => onFocus(slide.id)}
      onClick={() => onFocus(slide.id)}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab text-zinc-400 hover:text-zinc-600"
            {...attributes}
            {...listeners}
            aria-label="Перетягнути"
          >
            <GripVertical className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-zinc-900">Слайд {index + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md p-1 text-zinc-500 hover:bg-[color:var(--surface)]"
            title={isCollapsed ? 'Розгорнути' : 'Згорнути'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {confirmDel ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-600">Видалити?</span>
              <button
                type="button"
                className="font-medium text-red-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(slide.id);
                }}
              >
                Так
              </button>
              <button
                type="button"
                className="font-medium text-zinc-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDel(false);
                }}
              >
                Ні
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-zinc-400 hover:text-red-500"
              title="Видалити"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDel(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Заголовок</label>
      <input
        value={slide.title}
        onChange={(e) => onChange(slide.id, { title: e.target.value })}
        className="mb-3 w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
        onClick={(e) => e.stopPropagation()}
      />

      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Текст</label>
      <textarea
        value={slide.body}
        onChange={(e) => onChange(slide.id, { body: e.target.value })}
        rows={4}
        className="mb-4 w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
        onClick={(e) => e.stopPropagation()}
      />

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Вигляд</p>
      <p className="mb-1 text-xs text-zinc-600">Розташування тексту</p>
      <div className="mb-4">
        <PlacementToggle value={slide.placement} onChange={(p) => onChange(slide.id, { placement: p })} />
      </div>

      <p className="mb-1 text-xs text-zinc-600">Фон</p>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            checked={slide.backgroundType === 'color'}
            onChange={() => {
              const auto = getAutoTextColors(slide.backgroundColor);
              onChange(slide.id, {
                backgroundType: 'color',
                backgroundImageUrl: null,
                backgroundImageBase64: null,
                ...auto,
              });
            }}
          />
          Колір
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            checked={slide.backgroundType === 'image'}
            onChange={() => onChange(slide.id, { backgroundType: 'image' })}
          />
          Зображення
        </label>
      </div>

      {slide.backgroundType === 'color' ? (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-zinc-600">Фон:</span>
          <div className="flex flex-wrap gap-2">
            {brandColorOptions.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Фон ${color}`}
                onClick={() => {
                  const auto = getAutoTextColors(color);
                  onChange(slide.id, { backgroundColor: color, ...auto });
                }}
                className={[
                  'h-8 w-8 rounded border',
                  normalizeHex(slide.backgroundColor) === normalizeHex(color)
                    ? 'border-zinc-900 ring-2 ring-zinc-300'
                    : 'border-[color:var(--border)]',
                ].join(' ')}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <label className="btn-secondary inline-flex cursor-pointer rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-medium hover:bg-[color:var(--surface)]">
              Завантажити файл
              <input
                id={fileInputId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => {
                    const data = String(r.result ?? '');
                    onChange(slide.id, {
                      backgroundImageBase64: stripDataUrlBase64(data),
                      backgroundImageUrl: null,
                    });
                  };
                  r.readAsDataURL(f);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setUnsplashForId(slide.id)}
              className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-medium hover:bg-[color:var(--surface)]"
            >
              Unsplash →
            </button>
          </div>
          {(slide.backgroundImageUrl || slide.backgroundImageBase64) && (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  slide.backgroundImageBase64
                    ? `data:image/png;base64,${slide.backgroundImageBase64}`
                    : slide.backgroundImageUrl || ''
                }
                alt=""
                className="h-[60px] w-[60px] rounded-lg object-cover"
              />
              <button
                type="button"
                className="text-sm text-red-600 hover:underline"
                onClick={() =>
                  onChange(slide.id, { backgroundImageUrl: null, backgroundImageBase64: null })
                }
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-600">Колір заголовку</label>
          {slide.backgroundType === 'color' ? (
            <div className="flex flex-wrap gap-2">
              {availableTextColors.map((color) => (
                <button
                  key={`title-${color}`}
                  type="button"
                  aria-label={`Колір заголовку ${color}`}
                  onClick={() => onChange(slide.id, { titleColor: color })}
                  className={[
                    'h-8 w-8 rounded border',
                    normalizeHex(slide.titleColor) === normalizeHex(color)
                      ? 'border-zinc-900 ring-2 ring-zinc-300'
                      : 'border-[color:var(--border)]',
                  ].join(' ')}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          ) : (
            <input
              type="color"
              value={slide.titleColor}
              onChange={(e) => onChange(slide.id, { titleColor: e.target.value })}
              className="h-9 w-full max-w-[120px] cursor-pointer rounded border border-[color:var(--border)]"
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-600">Колір тексту</label>
          {slide.backgroundType === 'color' ? (
            <div className="flex flex-wrap gap-2">
              {availableTextColors.map((color) => (
                <button
                  key={`body-${color}`}
                  type="button"
                  aria-label={`Колір тексту ${color}`}
                  onClick={() => onChange(slide.id, { bodyColor: color })}
                  className={[
                    'h-8 w-8 rounded border',
                    normalizeHex(slide.bodyColor) === normalizeHex(color)
                      ? 'border-zinc-900 ring-2 ring-zinc-300'
                      : 'border-[color:var(--border)]',
                  ].join(' ')}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          ) : (
            <input
              type="color"
              value={slide.bodyColor}
              onChange={(e) => onChange(slide.id, { bodyColor: e.target.value })}
              className="h-9 w-full max-w-[120px] cursor-pointer rounded border border-[color:var(--border)]"
            />
          )}
        </div>
      </div>
        </>
      )}

    </div>
  );
}

function SlidePreview({
  slide,
  index,
  active,
  onActivate,
  previewRef,
}: {
  slide: Slide;
  index: number;
  active: boolean;
  onActivate: () => void;
  previewRef: (el: HTMLButtonElement | null) => void;
}) {
  const isLongContent = (slide.title.trim().length + slide.body.trim().length) > 95;
  const justify = isLongContent
    ? 'flex-start'
    : slide.placement === 'top'
      ? 'flex-start'
      : slide.placement === 'bottom'
        ? 'flex-end'
        : 'center';

  const bg: CSSProperties =
    slide.generatedImageBase64
      ? {}
      : slide.backgroundType === 'color'
        ? { backgroundColor: slide.backgroundColor }
        : {
            backgroundImage: slide.backgroundImageBase64
              ? `url(data:image/png;base64,${slide.backgroundImageBase64})`
              : slide.backgroundImageUrl
                ? `url(${slide.backgroundImageUrl})`
                : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          };

  return (
    <button
      type="button"
      ref={previewRef}
      onClick={onActivate}
      className={[
        'relative mb-4 w-[300px] shrink-0 overflow-hidden rounded-[12px] text-left shadow-[0_1px_3px_rgba(0,0,0,0.12)] outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2',
        active ? 'ring-2 ring-[color:var(--accent)] ring-offset-2' : '',
      ].join(' ')}
      style={{ width: 300, height: 300 }}
    >
      {slide.generatedImageBase64 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${slide.generatedImageBase64}`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          <div className="absolute inset-0" style={bg} />
          {slide.backgroundType === 'image' && (slide.backgroundImageUrl || slide.backgroundImageBase64) && (
            <div className="absolute inset-0 bg-black/[0.55]" />
          )}
          <div
            className="relative flex h-full flex-col overflow-hidden px-4 py-4"
            style={{ justifyContent: justify }}
          >
            <div>
              <p
                className="text-[34px] font-bold leading-none"
                style={{ color: slide.titleColor }}
              >
                {slide.title || 'Заголовок'}
              </p>
              <p
                className="mt-4 text-[20px] leading-snug"
                style={{ color: slide.bodyColor }}
              >
                {slide.body || 'Текст'}
              </p>
            </div>
          </div>
        </>
      )}
      <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
        {index + 1}
      </span>
    </button>
  );
}

export default function CarouselBuilder() {
  const { brandSettings } = useBrandStore();
  const [slides, setSlides] = useState<Slide[]>(() => [createSlide()]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(() => null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState(0);
  const [doneMask, setDoneMask] = useState<boolean[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [unsplashForId, setUnsplashForId] = useState<string | null>(null);
  const [collapsedSlideIds, setCollapsedSlideIds] = useState<string[]>([]);
  const previewRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const generateBlockRef = useRef<HTMLDivElement | null>(null);
  const { setBadge, clearBadge } = useNavBadges();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (hasGenerated && !hasDownloaded) {
      setBadge('carousel', true);
    }
  }, [hasGenerated, hasDownloaded, setBadge]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const scrollPreviewTo = useCallback((id: string) => {
    const el = previewRefs.current[id];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const brandColorOptions = useMemo(() => {
    const options = brandSettings
      ? [
          brandSettings.colors.lightBg,
          brandSettings.colors.darkBg,
          brandSettings.colors.accent1,
          brandSettings.colors.accent2,
        ]
      : [CAROUSEL_DEFAULT_BG, '#FFFFFF', '#000000', '#666666'];

    const unique = Array.from(new Set(options.map((color) => normalizeHex(color))));
    return unique.slice(0, 4);
  }, [brandSettings]);

  const getAutoTextColors = useCallback(
    (backgroundColor: string) => {
      const background = normalizeHex(backgroundColor);
      const ordered = [...brandColorOptions].sort(
        (a, b) => getContrastRatio(b, background) - getContrastRatio(a, background),
      );
      const usable = ordered.filter((c) => normalizeHex(c) !== background);
      const title =
        usable.find((c) => getContrastRatio(c, background) >= AA_CONTRAST_MIN) ??
        usable[0] ??
        ordered[0] ??
        '#FFFFFF';
      const body =
        usable.find((c) => normalizeHex(c) !== normalizeHex(title) && getContrastRatio(c, background) >= AA_CONTRAST_MIN) ??
        usable.find((c) => normalizeHex(c) !== normalizeHex(title)) ??
        title;
      return {
        titleColor: normalizeHex(title),
        bodyColor: normalizeHex(body),
      };
    },
    [brandColorOptions],
  );

  const updateSlide = useCallback((id: string, patch: Partial<Slide>) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  useEffect(() => {
    if (brandColorOptions.length === 0) return;
    setSlides((prev) =>
      prev.map((slide) => {
        if (slide.backgroundType !== 'color') return slide;
        const hasBrandBg = brandColorOptions.some(
          (color) => normalizeHex(color) === normalizeHex(slide.backgroundColor),
        );
        const nextBg = hasBrandBg ? slide.backgroundColor : brandColorOptions[0];
        return { ...slide, backgroundColor: nextBg, ...getAutoTextColors(nextBg) };
      }),
    );
  }, [brandColorOptions, getAutoTextColors]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSlides((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const addSlide = () => {
    if (slides.length >= MAX_SLIDES) return;
    const s = createSlide();
    const defaultBg = brandColorOptions[0] ?? CAROUSEL_DEFAULT_BG;
    const auto = getAutoTextColors(defaultBg);
    s.backgroundColor = defaultBg;
    s.titleColor = auto.titleColor;
    s.bodyColor = auto.bodyColor;
    setSlides((prev) => [...prev, s]);
    setCollapsedSlideIds((prev) => Array.from(new Set([...prev, s.id])));
    setActiveSlideId(s.id);
    setTimeout(() => scrollPreviewTo(s.id), 50);
  };

  const removeSlide = (id: string) => {
    setSlides((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.id !== id);
    });
    setCollapsedSlideIds((prev) => prev.filter((slideId) => slideId !== id));
    setActiveSlideId((cur) => (cur === id ? null : cur));
  };

  const runGeneration = async () => {
    const valid = slides.some((s) => s.title.trim().length > 0);
    if (!valid) {
      setValidationError('Додай заголовок хоча б на одному слайді.');
      return;
    }
    setValidationError(null);
    setIsGenerating(true);
    setGeneratingIndex(0);
    const snapshot = slides;
    setDoneMask(snapshot.map(() => false));
    setHasGenerated(false);

    const total = snapshot.length;
    try {
      for (let i = 0; i < snapshot.length; i++) {
        setGeneratingIndex(i);
        const s = snapshot[i];
        const body: Record<string, unknown> = {
          title: s.title,
          body: s.body,
          placement: s.placement,
          background_type: s.backgroundType,
          background_color: s.backgroundColor,
          background_image_url: s.backgroundType === 'image' ? s.backgroundImageUrl : null,
          title_color: s.titleColor,
          body_color: s.bodyColor,
          slide_index: i + 1,
          total_slides: total,
        };
        if (s.backgroundType === 'image' && s.backgroundImageBase64) {
          body.background_image_base64 = s.backgroundImageBase64;
        }

        const res = await fetch('/api/carousel/generate-slide', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { image_base64?: string; error?: string };
        if (!res.ok || !data.image_base64) {
          throw new Error(data.error ?? 'Помилка генерації');
        }
        setSlides((prev) =>
          prev.map((row, j) =>
            j === i ? { ...row, generatedImageBase64: data.image_base64! } : row
          )
        );
        setDoneMask((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }
      setHasGenerated(true);
      setHasDownloaded(false);
    } catch (e) {
      console.error(e);
      setValidationError('Не вдалося згенерувати слайди.');
    } finally {
      setIsGenerating(false);
      setGeneratingIndex(0);
    }
  };

  const downloadAll = async () => {
    let stagger = 0;
    for (let i = 0; i < slides.length; i++) {
      const b64 = slides[i].generatedImageBase64;
      if (!b64) continue;
      window.setTimeout(() => {
        const a = document.createElement('a');
        a.href = `data:image/png;base64,${b64}`;
        a.download = `ruta-carousel-${i + 1}.png`;
        a.click();
      }, stagger);
      stagger += 200;
    }
    clearBadge('carousel');
    setHasDownloaded(true);
    showToast('Слайди збережено ✓');
  };

  const downloadOne = (i: number) => {
    const b64 = slides[i].generatedImageBase64;
    if (!b64) return;
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${b64}`;
    a.download = `ruta-carousel-${i + 1}.png`;
    a.click();
    clearBadge('carousel');
    setHasDownloaded(true);
    showToast('Слайди збережено ✓');
  };

  const editMore = () => {
    setSlides((prev) => prev.map((s) => ({ ...s, generatedImageBase64: null })));
    setHasGenerated(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex min-h-[min(720px,calc(100vh-8rem))] flex-col gap-6 lg:flex-row">
        <div className="flex w-full shrink-0 flex-col border-[color:var(--border)] lg:w-[420px] lg:border-r lg:pr-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-zinc-900">Карусель</h1>
            <button
              type="button"
              disabled={slides.length >= MAX_SLIDES}
              title={slides.length >= MAX_SLIDES ? 'Максимум 20 слайдів' : undefined}
              onClick={addSlide}
              className="rounded-xl border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Додати слайд
            </button>
            <span className="text-sm text-zinc-500">
              {slides.length} / {MAX_SLIDES}
            </span>
          </div>
          {validationError && (
            <p className="mb-3 text-sm text-red-600" role="alert">
              {validationError}
            </p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-4 pb-8">
                {slides.map((slide, index) => (
                  <SortableSlideCard
                    key={slide.id}
                    slide={slide}
                    index={index}
                    onChange={updateSlide}
                    onRemove={removeSlide}
                    brandColorOptions={brandColorOptions}
                    getAutoTextColors={getAutoTextColors}
                    isCollapsed={collapsedSlideIds.includes(slide.id)}
                    onToggleCollapse={() =>
                      setCollapsedSlideIds((prev) =>
                        prev.includes(slide.id) ? prev.filter((id) => id !== slide.id) : [...prev, slide.id],
                      )
                    }
                    onFocus={(id) => {
                      setActiveSlideId(id);
                      scrollPreviewTo(id);
                    }}
                    setUnsplashForId={setUnsplashForId}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="relative min-w-0 flex-1 overflow-y-auto">
          <div ref={generateBlockRef} className="sticky top-0 z-10 mb-3 w-full max-w-[300px] mx-auto bg-white/95 px-2 py-3 backdrop-blur-sm">
            {isGenerating && (
              <div className="mb-4 rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-medium text-zinc-900">Генеруємо слайди…</p>
                <ul className="space-y-2 text-sm">
                  {slides.map((_, i) => (
                    <li key={i} className="flex items-center gap-2">
                      {doneMask[i] ? (
                        <Check className="h-4 w-4 text-[color:var(--accent)]" />
                      ) : generatingIndex === i ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" />
                      ) : (
                        <Circle className="h-4 w-4 text-zinc-300" />
                      )}
                      <span className="text-zinc-700">Слайд {i + 1}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!hasGenerated ? (
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => void runGeneration()}
                className="w-full rounded-xl bg-[color:var(--accent)] py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
              >
                Згенерувати карусель
              </button>
            ) : (
              <div className="space-y-4">
                <p className="text-center text-sm font-medium text-zinc-900">Готово! 🎉</p>
                <button
                  type="button"
                  onClick={() => void downloadAll()}
                  className="w-full rounded-xl bg-[color:var(--accent)] py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.97]"
                >
                  ⬇ Завантажити всі
                </button>
                <div className="flex flex-wrap gap-2">
                  {slides.map((s, i) =>
                    s.generatedImageBase64 ? (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => downloadOne(i)}
                        className="btn-secondary rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-[color:var(--surface)]"
                      >
                        ⬇ Слайд {i + 1}
                      </button>
                    ) : null
                  )}
                </div>
                <button
                  type="button"
                  onClick={editMore}
                  className="w-full rounded-xl border border-[color:var(--border)] py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)]"
                >
                  ✏ Редагувати далі
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center px-2 pb-8">
            {slides.map((slide, index) => (
              <SlidePreview
                key={slide.id}
                slide={slide}
                index={index}
                active={activeSlideId === slide.id}
                onActivate={() => {
                  setActiveSlideId(slide.id);
                  scrollPreviewTo(slide.id);
                }}
                previewRef={(el) => {
                  previewRefs.current[slide.id] = el;
                }}
              />
            ))}
          </div>

          {isGenerating && (
            <div className="pointer-events-none absolute inset-0 z-[5] rounded-2xl bg-white/40" />
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[300] rounded-xl border border-[color:var(--border)] bg-white px-4 py-3 text-sm shadow-lg">
          {toast}
        </div>
      )}

      <UnsplashModal
        open={unsplashForId !== null}
        onClose={() => setUnsplashForId(null)}
        onPick={(url) => {
          if (unsplashForId) {
            updateSlide(unsplashForId, { backgroundImageUrl: url, backgroundImageBase64: null });
          }
          setUnsplashForId(null);
        }}
      />
    </div>
  );
}
