'use client';

import { useState } from 'react';
import { GripVertical, Plus, X } from 'lucide-react';
import type { Slide, SlideKind } from '@/lib/carouselTypes';
import type { BrandAccentStyle } from '@/lib/brand';
import AccentRichTextField from '@/components/carousel/AccentRichTextField';
import TextAlignToggle from '@/components/carousel/TextAlignToggle';
import PlacementToggle from '@/components/carousel/PlacementToggle';

const KIND_CHIPS: { id: SlideKind; label: string }[] = [
  { id: 'cover', label: 'Обкладинка' },
  { id: 'content', label: 'Контент' },
  { id: 'statement', label: 'Висловлювання' },
  { id: 'bullets', label: 'Буліти' },
  { id: 'cta', label: 'CTA' },
];

export default function CarouselEditorTextTab({
  slide,
  index,
  totalSlides,
  accentStyle,
  accentColor,
  onChange,
  onRemoveSlide,
}: {
  slide: Slide;
  index: number;
  totalSlides: number;
  accentStyle: BrandAccentStyle;
  accentColor: string;
  onChange: (id: string, patch: Partial<Slide>) => void;
  onRemoveSlide: (id: string) => void;
}) {
  const kind = slide.slideKind ?? 'content';
  /** Cover uses body as the line under the title in preview/export (not only design_note). */
  const showBody = kind !== 'statement';
  const showLabel = kind === 'content';
  const showBullets = kind === 'bullets';

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const items = slide.items?.length ? slide.items : [''];

  const reorderItems = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = [...items];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(slide.id, { items: next.filter((x) => x.trim().length > 0 || next.length === 1) });
  };

  return (
    <div className="space-y-5 pb-4">
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">Тип слайду</label>
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          {KIND_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                const patch: Partial<Slide> = { slideKind: c.id };
                if (c.id === 'statement') patch.layout = 'text_only';
                else patch.layout = 'title_and_text';
                onChange(slide.id, patch);
              }}
              className={[
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                kind === c.id
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
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Заголовок</label>
        </div>
        <AccentRichTextField
          slideId={slide.id}
          field="title"
          value={slide.title}
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

      {showLabel && (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Мітка кроку
          </label>
          <input
            type="text"
            value={slide.label ?? ''}
            onChange={(e) => onChange(slide.id, { label: e.target.value || null })}
            placeholder="Крок 01"
            className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
          />
        </div>
      )}

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
                    onChange(slide.id, { items: next });
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
                />
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Видалити пункт"
                  onClick={() => {
                    const next = items.filter((_, j) => j !== i);
                    onChange(slide.id, { items: next.length ? next : [''] });
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onChange(slide.id, { items: [...items, ''] })}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-[color:var(--border)] px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-[color:var(--surface)]"
          >
            <Plus className="h-4 w-4" />
            Додати пункт
          </button>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs text-zinc-600">Розташування тексту</p>
        <PlacementToggle value={slide.placement} onChange={(p) => onChange(slide.id, { placement: p })} />
      </div>

      <div>
        <p className="mb-1 text-xs text-zinc-600">Вирівнювання</p>
        <TextAlignToggle value={slide.textAlign} onChange={(a) => onChange(slide.id, { textAlign: a })} />
      </div>

      {totalSlides > 1 && (
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
