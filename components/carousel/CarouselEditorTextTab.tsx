'use client';

import { useState } from 'react';
import { GripVertical, Plus, X } from 'lucide-react';
import type { Slide } from '@/lib/carouselTypes';
import type { BrandAccentStyle } from '@/lib/brand';
import { normalizeHex } from '@/lib/brand';
import AccentRichTextField from '@/components/carousel/AccentRichTextField';

export default function CarouselEditorTextTab({
  slide,
  index,
  totalSlides,
  accentStyle,
  accentColor,
  onChange,
  onRemoveSlide,
  textColorChoices = [],
  showStructureControls = true,
  showPositionControls = true,
}: {
  slide: Slide;
  index: number;
  totalSlides: number;
  accentStyle: BrandAccentStyle;
  accentColor: string;
  onChange: (id: string, patch: Partial<Slide>) => void;
  onRemoveSlide: (id: string) => void;
  textColorChoices?: string[];
  showStructureControls?: boolean;
  showPositionControls?: boolean;
}) {
  const slideType = slide.slideType ?? 'slide';
  const layoutPreset = slide.layoutPreset ?? (slideType === 'final' ? 'goal' : 'text');
  const showBody = slideType === 'slide' && layoutPreset === 'text';
  const showLabel = slideType === 'slide' && layoutPreset === 'text';
  const showBullets = slideType === 'slide' && layoutPreset === 'list';
  const showTitleSize = true;
  const showBodySize = slideType === 'slide' && (layoutPreset === 'text' || layoutPreset === 'list');

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const items = slide.listItems?.length ? slide.listItems : [''];

  const reorderItems = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = [...items];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(slide.id, { listItems: next.filter((x) => x.trim().length > 0 || next.length === 1) });
  };

  return (
    <div className="space-y-5 pb-4">
      {showStructureControls ? null : null}
      {showLabel ? (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Мітка (опціонально)</label>
          <input
            type="text"
            value={slide.optionalLabel ?? ''}
            maxLength={30}
            onChange={(e) => onChange(slide.id, { optionalLabel: e.target.value })}
            placeholder="Наприклад: Порада, Факт, Крок 1..."
            className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm placeholder:text-zinc-400 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
          />
        </div>
      ) : null}

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {slideType === 'final' && layoutPreset === 'reaction' ? 'CTA title' : 'Заголовок'}
          </label>
        </div>
        <AccentRichTextField
          slideId={slide.id}
          field={slideType === 'final' && layoutPreset === 'reaction' ? 'ctaTitle' : 'title'}
          value={slideType === 'final' && layoutPreset === 'reaction' ? slide.ctaTitle ?? '' : slide.title}
          onPatch={onChange}
          multiline
          rows={1}
          autoGrow
          toolbarPlacement="corner"
          showPreviewLine={false}
          baseColor={slide.titleColor}
          accentStyle={accentStyle}
          accentColor={accentColor}
          inputClassName="min-h-[2.5rem] w-full resize-none rounded-xl border border-[color:var(--border)] py-2 pl-3 pr-14 pt-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
        />
      </div>

      {showBody && (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Текст</label>
          </div>
          <AccentRichTextField
            slideId={slide.id}
            field="body"
            value={slide.body}
            onPatch={onChange}
            multiline
            rows={2}
            autoGrow
            toolbarPlacement="corner"
            showPreviewLine={false}
            baseColor={slide.bodyColor}
            accentStyle={accentStyle}
            accentColor={accentColor}
            inputClassName="min-h-[2.75rem] w-full resize-none rounded-xl border border-[color:var(--border)] py-2 pl-3 pr-14 pt-8 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
          />
        </div>
      )}
      {slideType === 'slide' && layoutPreset === 'testimonial' ? (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Ім&apos;я автора</label>
            <input
              type="text"
              value={slide.testimonialAuthor?.name ?? ''}
              onChange={(e) =>
                onChange(slide.id, {
                  testimonialAuthor: {
                    name: e.target.value,
                    handle: slide.testimonialAuthor?.handle ?? '',
                    avatar_url: slide.testimonialAuthor?.avatar_url ?? null,
                  },
                })
              }
              className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">@Handle</label>
            <input
              type="text"
              value={slide.testimonialAuthor?.handle ?? ''}
              onChange={(e) =>
                onChange(slide.id, {
                  testimonialAuthor: {
                    name: slide.testimonialAuthor?.name ?? '',
                    handle: e.target.value,
                    avatar_url: slide.testimonialAuthor?.avatar_url ?? null,
                  },
                })
              }
              className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Avatar URL (опц.)</label>
            <input
              type="url"
              value={slide.testimonialAuthor?.avatar_url ?? ''}
              onChange={(e) =>
                onChange(slide.id, {
                  testimonialAuthor: {
                    name: slide.testimonialAuthor?.name ?? '',
                    handle: slide.testimonialAuthor?.handle ?? '',
                    avatar_url: e.target.value.trim() || null,
                  },
                })
              }
              className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
            />
          </div>
        </>
      ) : null}

      {showBullets && (
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">Пункти</label>
          <ul className="space-y-2">
            {items.map((line, i) => (
              <li
                key={i}
                className="flex items-center gap-2"
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom === null) return;
                  reorderItems(dragFrom, i);
                  setDragFrom(null);
                }}
              >
                <span className="cursor-grab text-zinc-400" aria-hidden>
                  <GripVertical className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  value={line}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = e.target.value;
                    onChange(slide.id, { listItems: next });
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
                />
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Видалити пункт"
                  onClick={() => {
                    const next = items.filter((_, j) => j !== i);
                    onChange(slide.id, { listItems: next.length ? next : [''] });
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onChange(slide.id, { listItems: [...items, ''] })}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-[color:var(--border)] px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-[color:var(--surface)]"
          >
            <Plus className="h-4 w-4" />
            Додати пункт
          </button>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Стиль маркерів</label>
            <select
              value={slide.bulletStyle ?? 'numbered-padded'}
              onChange={(e) => onChange(slide.id, { bulletStyle: e.target.value as Slide['bulletStyle'] })}
              className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm"
            >
              <option value="numbered-padded">01. 02. 03.</option>
              <option value="numbered-simple">1 · 2 · 3</option>
              <option value="dots">● ● ●</option>
              <option value="dashes">— — —</option>
              <option value="checks">✓ ✓ ✓</option>
              <option value="cross-check">✗ / ✓ ✓</option>
            </select>
          </div>
        </div>
      )}
      {slideType === 'final' && layoutPreset === 'goal' ? (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">Дія CTA</label>
          <select
            value={slide.ctaAction ?? 'follow'}
            onChange={(e) => onChange(slide.id, { ctaAction: e.target.value as Slide['ctaAction'] })}
            className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm"
          >
            <option value="follow">Підпишись</option>
            <option value="save">Збережи</option>
            <option value="share">Поділись</option>
            <option value="comment">Коментуй</option>
            <option value="link">Перейди</option>
          </select>
        </div>
      ) : null}
      {slideType === 'final' && layoutPreset === 'reaction' ? (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">CTA keyword</label>
          <input
            type="text"
            value={slide.ctaKeyword ?? ''}
            onChange={(e) => onChange(slide.id, { ctaKeyword: e.target.value })}
            className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
          />
        </div>
      ) : null}
      {showTitleSize ? (
        <div>
          <p className="mb-1 text-xs text-zinc-600">Title size</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'L', label: 'L Великий' },
              { id: 'M', label: 'M Середній' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(slide.id, { titleSize: opt.id as 'L' | 'M' })}
                className={[
                  'rounded-lg px-2 py-2 text-[11px]',
                  (slide.titleSize ?? 'L') === opt.id
                    ? 'border-[1.5px] border-[#4a6cf7] bg-[#eef1ff] font-medium text-[#1a1a1a]'
                    : 'border border-[#d8d6cf] bg-white text-[#555]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showBodySize ? (
        <div>
          <p className="mb-1 text-xs text-zinc-600">Body size</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'M', label: 'M Середній' },
              { id: 'S', label: 'S Малий' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange(slide.id, { bodySize: opt.id as 'M' | 'S' })}
                className={[
                  'rounded-lg px-2 py-2 text-[11px]',
                  (slide.bodySize ?? 'M') === opt.id
                    ? 'border-[1.5px] border-[#4a6cf7] bg-[#eef1ff] font-medium text-[#1a1a1a]'
                    : 'border border-[#d8d6cf] bg-white text-[#555]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <p className="mb-1 text-xs text-zinc-600">Колір тексту</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs text-zinc-600">Заголовок</label>
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
            <label className="mb-2 block text-xs text-zinc-600">Основний текст</label>
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
      </div>

      {showPositionControls && totalSlides > 1 && (
        <button
          type="button"
          onClick={() => onRemoveSlide(slide.id)}
          className="w-full rounded-xl border border-red-200 bg-red-50 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
        >
          Видалити слайд {index + 1}
        </button>
      )}
    </div>
  );
}
