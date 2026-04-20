'use client';

import { useId } from 'react';
import { Check } from 'lucide-react';
import type { Slide, SlideOverlayType } from '@/lib/carouselTypes';
import { normalizeHex } from '@/lib/brand';

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
  getAutoTextColors,
  onChange,
  onUnsplash,
}: {
  slide: Slide;
  brandColorOptions: string[];
  getAutoTextColors: (bg: string) => { titleColor: string; bodyColor: string };
  onChange: (id: string, patch: Partial<Slide>) => void;
  onUnsplash: () => void;
}) {
  const fileInputId = useId();
  const hasPhoto = slide.backgroundType === 'image' && (slide.backgroundImageUrl || slide.backgroundImageBase64);
  const availableTextColors = brandColorOptions.filter(
    (color) => normalizeHex(color) !== normalizeHex(slide.backgroundColor),
  );

  const setOverlayPatch = (patch: Partial<Slide>) => {
    onChange(slide.id, patch);
  };

  return (
    <div className="space-y-5 pb-4">
      <div className="flex gap-3 text-sm">
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
                overlayType: null,
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
            onChange={() => {
              onChange(slide.id, {
                backgroundType: 'image',
                overlayType: slide.overlayType ?? 'full',
              });
            }}
          />
          Фото
        </label>
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
                    });
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
                        });
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
          {slide.backgroundType === 'color' ? (
            <div className="flex flex-wrap gap-2">
              {availableTextColors.map((color) => (
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
          ) : (
            <input
              type="color"
              value={slide.titleColor}
              onChange={(e) => onChange(slide.id, { titleColor: e.target.value })}
              className="h-10 w-full max-w-[140px] cursor-pointer rounded border border-[color:var(--border)]"
            />
          )}
        </div>
        <div>
          <label className="mb-2 block text-xs text-zinc-600">Колір тексту</label>
          {slide.backgroundType === 'color' ? (
            <div className="flex flex-wrap gap-2">
              {availableTextColors.map((color) => (
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
          ) : (
            <input
              type="color"
              value={slide.bodyColor}
              onChange={(e) => onChange(slide.id, { bodyColor: e.target.value })}
              className="h-10 w-full max-w-[140px] cursor-pointer rounded border border-[color:var(--border)]"
            />
          )}
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
