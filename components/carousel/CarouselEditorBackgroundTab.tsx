'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { Slide, SlideOverlayType } from '@/lib/carouselTypes';
import { normalizeHex } from '@/lib/brand';
import {
  DEFAULT_BG_PHOTO_TRANSFORM,
  getBgPhotoTransform,
  MAX_BG_PHOTO_SCALE,
  MIN_BG_PHOTO_SCALE,
  zoomAroundPoint,
} from '@/lib/carousel/bgPhotoTransform';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/carousel/carouselConstants';

function stripDataUrlBase64(data: string): string {
  const m = data.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : data;
}

const OVERLAY_CHIPS: { id: SlideOverlayType; label: string }[] = [
  { id: 'full', label: 'Повний' },
  { id: 'backdrop', label: 'Підкладка' },
  { id: 'frost', label: 'Фрост' },
  { id: 'gradient', label: 'Градієнт' },
];

export default function CarouselEditorBackgroundTab({
  slide,
  brandColorOptions,
  brandVibe,
  getAutoTextColors,
  onChange,
  onUnsplash,
  onPhotoUploadSuccess,
  onPhotoUploadError,
}: {
  slide: Slide;
  brandColorOptions: string[];
  brandVibe: 'bold' | 'refined';
  getAutoTextColors: (bg: string) => { titleColor: string; bodyColor: string };
  onChange: (id: string, patch: Partial<Slide>) => void;
  onUnsplash: () => void;
  onPhotoUploadSuccess?: () => void;
  onPhotoUploadError?: () => void;
}) {
  const fileInputId = useId();
  const hasPhoto = slide.backgroundType === 'image' && (slide.backgroundImageUrl || slide.backgroundImageBase64);
  const [isDesktop, setIsDesktop] = useState(false);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const transform = getBgPhotoTransform(slide.bgPhotoTransform);
  const zoomPercent = Math.round(transform.scale * 100);
  const photoSrc = slide.backgroundImageBase64
    ? `data:image/png;base64,${slide.backgroundImageBase64}`
    : slide.backgroundImageUrl || '';
  const availableTextColorsForSolidBg = brandColorOptions.filter(
    (color) => normalizeHex(color) !== normalizeHex(slide.backgroundColor),
  );
  const textColorChoices =
    slide.backgroundType === 'color'
      ? availableTextColorsForSolidBg
      : slide.overlayType === 'frost' || slide.overlayType === 'gradient'
        ? brandColorOptions
        : brandColorOptions.filter((color) => normalizeHex(color) !== normalizeHex(slide.overlayColor));

  const setOverlayPatch = (patch: Partial<Slide>) => {
    onChange(slide.id, patch);
  };
  const gradientStops = [
    slide.backgroundColor || brandColorOptions[0] || '#f5f2ed',
    slide.gradientMidColor ||
      brandColorOptions[Math.floor((brandColorOptions.length - 1) / 2)] ||
      '#d6b58a',
    slide.gradientEndColor || brandColorOptions[brandColorOptions.length - 1] || '#1a1a2e',
  ];
  const gradientCss =
    brandVibe === 'refined'
      ? `radial-gradient(ellipse at 40% 30%, ${gradientStops[0]} 0%, ${gradientStops[1]} 60%, ${gradientStops[2]} 100%)`
      : `radial-gradient(circle at 30% 30%, ${gradientStops[0]} 0%, ${gradientStops[1]} 60%, ${gradientStops[2]} 100%)`;

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!photoSrc) {
      return;
    }
    const img = new Image();
    img.onload = () => setSourceSize({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => setSourceSize(null);
    img.src = photoSrc;
  }, [photoSrc]);

  const isLowRes = useMemo(() => {
    if (!photoSrc) return false;
    if (!sourceSize) return false;
    const shortSide = Math.min(sourceSize.width, sourceSize.height);
    return shortSide > 0 && shortSide < 1080;
  }, [photoSrc, sourceSize]);

  return (
    <div className="space-y-5 pb-4">
      <div className="flex gap-2 text-xs">
        {[
          { id: 'color', label: 'Колір' },
          { id: 'gradient', label: 'Градієнт' },
          { id: 'image', label: 'Фото' },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              if (opt.id === 'color') {
                const auto = getAutoTextColors(slide.backgroundColor);
                onChange(slide.id, {
                  backgroundType: 'color',
                  backgroundImageUrl: null,
                  backgroundImageBase64: null,
                  bgPhotoTransform: undefined,
                  overlayType: null,
                  ...auto,
                });
                return;
              }
              if (opt.id === 'gradient') {
                const start = slide.backgroundColor || brandColorOptions[0] || '#f5f2ed';
                const mid =
                  slide.gradientMidColor ||
                  brandColorOptions[Math.floor((brandColorOptions.length - 1) / 2)] ||
                  '#d6b58a';
                const end = slide.gradientEndColor || brandColorOptions[brandColorOptions.length - 1] || '#1a1a2e';
                const auto = getAutoTextColors(end);
                onChange(slide.id, {
                  backgroundType: 'gradient',
                  backgroundColor: start,
                  gradientMidColor: mid,
                  gradientEndColor: end,
                  backgroundImageUrl: null,
                  backgroundImageBase64: null,
                  bgPhotoTransform: undefined,
                  overlayType: null,
                  ...auto,
                });
                return;
              }
              onChange(slide.id, {
                backgroundType: 'image',
                overlayType: slide.overlayType ?? 'full',
                bgPhotoTransform: slide.bgPhotoTransform ?? DEFAULT_BG_PHOTO_TRANSFORM,
              });
            }}
            className={[
              'rounded-full border px-3 py-1.5 font-medium transition',
              slide.backgroundType === opt.id
                ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                : 'border-[color:var(--border)] bg-white text-zinc-700',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {slide.backgroundType === 'color' ? (
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">Фон</label>
          <div className="flex flex-wrap gap-3">
            {brandColorOptions.map((color) => {
              const active = normalizeHex(slide.backgroundColor) === normalizeHex(color);
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`Колір фону ${color}`}
                  onClick={() => {
                    const auto = getAutoTextColors(color);
                    onChange(slide.id, { backgroundColor: color, ...auto });
                  }}
                  className={[
                    'relative h-11 w-11 rounded-full border-2 transition-transform duration-[120ms] ease-out',
                    active
                      ? 'scale-[1.08] border-zinc-900 shadow-sm'
                      : 'border-[color:var(--border)] hover:scale-105',
                  ].join(' ')}
                  style={{ backgroundColor: color }}
                >
                  {active ? (
                    <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" strokeWidth={2.5} />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : slide.backgroundType === 'gradient' ? (
        <div className="space-y-2">
          <div className="w-full rounded-xl border border-[color:var(--border)]" style={{ aspectRatio: '4 / 1', background: gradientCss }} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { key: 'backgroundColor', label: 'Початок', value: gradientStops[0] },
              { key: 'gradientMidColor', label: 'Середина', value: gradientStops[1] },
              { key: 'gradientEndColor', label: 'Кінець', value: gradientStops[2] },
            ].map((stop) => (
              <div key={stop.key}>
                <label className="mb-1 block text-xs font-medium text-zinc-600">{stop.label}</label>
                <div className="flex flex-wrap gap-2">
                  {brandColorOptions.map((color) => {
                    const active = normalizeHex(stop.value) === normalizeHex(color);
                    return (
                      <button
                        key={`${stop.key}-${color}`}
                        type="button"
                        aria-label={`${stop.label} ${color}`}
                        onClick={() => {
                          const nextPatch: Partial<Slide> =
                            stop.key === 'backgroundColor'
                              ? { backgroundColor: color }
                              : stop.key === 'gradientMidColor'
                                ? { gradientMidColor: color }
                                : { gradientEndColor: color };
                          const auto = getAutoTextColors(
                            stop.key === 'gradientEndColor' ? color : gradientStops[2],
                          );
                          onChange(slide.id, { ...nextPatch, ...auto });
                        }}
                        className={[
                          'h-8 w-8 rounded-full border-2 transition-transform duration-[120ms] ease-out',
                          active ? 'scale-[1.08] border-zinc-900' : 'border-[color:var(--border)]',
                        ].join(' ')}
                        style={{ backgroundColor: color }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {!hasPhoto ? (
            <label
              htmlFor={fileInputId}
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[color:var(--border)] bg-[color:var(--surface)]/50 px-4 py-10 text-center text-sm text-zinc-600"
            >
              Додати фото
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
                      overlayType: slide.overlayType ?? 'full',
                      bgPhotoTransform: DEFAULT_BG_PHOTO_TRANSFORM,
                    });
                    onPhotoUploadSuccess?.();
                  };
                  r.onerror = () => {
                    onPhotoUploadError?.();
                  };
                  r.readAsDataURL(f);
                }}
              />
            </label>
          ) : (
            <div className="flex flex-wrap items-start gap-3">
              <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-[color:var(--border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    slide.backgroundImageBase64
                      ? `data:image/png;base64,${slide.backgroundImageBase64}`
                      : slide.backgroundImageUrl || ''
                  }
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white"
                  onClick={() =>
                    onChange(slide.id, {
                      backgroundImageUrl: null,
                      backgroundImageBase64: null,
                      overlayType: null,
                      bgPhotoTransform: undefined,
                    })
                  }
                >
                  ×
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <label className="btn-secondary inline-flex w-fit cursor-pointer rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-medium hover:bg-[color:var(--surface)]">
                  Замінити
                  <input
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
                          bgPhotoTransform: DEFAULT_BG_PHOTO_TRANSFORM,
                        });
                        onPhotoUploadSuccess?.();
                      };
                      r.onerror = () => {
                        onPhotoUploadError?.();
                      };
                      r.readAsDataURL(f);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={onUnsplash}
                  className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-left text-xs font-medium hover:bg-[color:var(--surface)]"
                >
                  Unsplash →
                </button>
              </div>
            </div>
          )}

          {hasPhoto && (
            <>
              <div className="space-y-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/30 p-3">
                <p className="text-xs text-zinc-600">Тягни фото на слайді, щоб розташувати</p>
                <button
                  type="button"
                  onClick={() => onChange(slide.id, { bgPhotoTransform: DEFAULT_BG_PHOTO_TRANSFORM })}
                  className="inline-flex min-h-11 items-center rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs font-medium hover:bg-white"
                >
                  Центрувати
                </button>
                {isDesktop ? (
                  <div>
                    <label className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-600">
                      <span>Зум</span>
                      <span>{zoomPercent}%</span>
                    </label>
                    <input
                      type="range"
                      min={Math.round(MIN_BG_PHOTO_SCALE * 100)}
                      max={Math.round(MAX_BG_PHOTO_SCALE * 100)}
                      step={1}
                      value={zoomPercent}
                      onChange={(e) => {
                        const nextScale = Number.parseInt(e.target.value, 10) / 100;
                        const next = zoomAroundPoint(
                          transform,
                          nextScale,
                          0,
                          0,
                          CANVAS_WIDTH,
                          CANVAS_HEIGHT,
                        );
                        onChange(slide.id, { bgPhotoTransform: next });
                      }}
                      className="w-full accent-[color:var(--accent)]"
                    />
                  </div>
                ) : null}
                {isLowRes ? <p className="text-xs text-amber-700">Фото може виглядати нечітко</p> : null}
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">Оверлей</label>
                <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
                  {OVERLAY_CHIPS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setOverlayPatch({ overlayType: c.id })}
                      className={[
                        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        slide.overlayType === c.id
                          ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                          : 'border-[color:var(--border)] bg-white text-zinc-700 hover:bg-[color:var(--surface)]',
                      ].join(' ')}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Колір оверлею
                </label>
                <div className="flex flex-wrap gap-3">
                  {brandColorOptions.map((color) => {
                    const active = normalizeHex(slide.overlayColor) === normalizeHex(color);
                    return (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Оверлей ${color}`}
                        onClick={() => setOverlayPatch({ overlayColor: color })}
                        className={[
                          'relative h-11 w-11 rounded-full border-2 transition-transform duration-[120ms] ease-out',
                          active ? 'scale-[1.08] border-zinc-900 shadow-sm' : 'border-[color:var(--border)]',
                        ].join(' ')}
                        style={{ backgroundColor: color }}
                      >
                        {active ? (
                          <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" strokeWidth={2.5} />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {slide.overlayType !== 'frost' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    Прозорість: {slide.overlayOpacity ?? 50}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={slide.overlayOpacity ?? 50}
                    onChange={(e) =>
                      setOverlayPatch({ overlayOpacity: Number.parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-[color:var(--accent)]"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs text-zinc-600">Колір заголовку</label>
          <div className="flex flex-wrap gap-2">
            {textColorChoices.map((color) => (
              <button
                key={`title-${color}`}
                type="button"
                aria-label={`Заголовок ${color}`}
                onClick={() => onChange(slide.id, { titleColor: color })}
                className={[
                  'h-9 w-9 rounded-full border-2 transition-transform duration-[120ms] ease-out',
                  normalizeHex(slide.titleColor) === normalizeHex(color)
                    ? 'scale-[1.08] border-zinc-900'
                    : 'border-[color:var(--border)]',
                ].join(' ')}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs text-zinc-600">Колір тексту</label>
          <div className="flex flex-wrap gap-2">
            {textColorChoices.map((color) => (
              <button
                key={`body-${color}`}
                type="button"
                aria-label={`Текст ${color}`}
                onClick={() => onChange(slide.id, { bodyColor: color })}
                className={[
                  'h-9 w-9 rounded-full border-2 transition-transform duration-[120ms] ease-out',
                  normalizeHex(slide.bodyColor) === normalizeHex(color)
                    ? 'scale-[1.08] border-zinc-900'
                    : 'border-[color:var(--border)]',
                ].join(' ')}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      {slide.design_note && (
        <p className="text-xs leading-relaxed text-zinc-500">
          <span aria-hidden>💡 </span>
          {slide.design_note}
        </p>
      )}
    </div>
  );
}
