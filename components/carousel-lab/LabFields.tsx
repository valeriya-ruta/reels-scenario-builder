'use client';

import { useRef, useState } from 'react';
import type { LabSlide, LabImage } from '@/lib/carousel-lab/types';
import { LIMITS } from '@/lib/carousel-lab/tokens';
import { uploadLabImage } from '@/lib/carousel-lab/uploadImage';
import { resolveImageSrc } from '@/lib/carousel-lab/imageResolve';

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">{children}</div>;
}

function TextField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none focus:border-[#4a6cf7]"
      />
      {maxLength ? (
        <div className="mt-0.5 text-right text-[11px] text-neutral-400">
          {value.length}/{maxLength}
        </div>
      ) : null}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  maxLength,
  rows = 4,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  rows?: number;
  hint?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={rows}
        className="w-full resize-y rounded-lg border border-neutral-200 px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-[#4a6cf7]"
      />
      <div className="mt-0.5 flex justify-between text-[11px] text-neutral-400">
        <span>{hint}</span>
        {maxLength ? <span>{value.length}/{maxLength}</span> : null}
      </div>
    </div>
  );
}

function BulletsEditor({
  bullets,
  onChange,
}: {
  bullets: string[];
  onChange: (b: string[]) => void;
}) {
  const list = bullets.length ? bullets : [''];
  return (
    <div>
      <Label>Пункти списку (макс. {LIMITS.bulletsMax})</Label>
      <div className="space-y-1.5">
        {list.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-5 text-center text-[12px] text-neutral-400">{i + 1}</span>
            <input
              value={b}
              maxLength={LIMITS.bulletItem}
              onChange={(e) => {
                const next = [...list];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-[#4a6cf7]"
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              className="rounded-md px-2 py-1 text-[12px] text-neutral-400 hover:bg-neutral-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {list.length < LIMITS.bulletsMax && (
        <button
          type="button"
          onClick={() => onChange([...list, ''])}
          className="mt-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-1.5 text-[12.5px] text-neutral-500 hover:border-[#4a6cf7] hover:text-[#4a6cf7]"
        >
          + Додати пункт
        </button>
      )}
    </div>
  );
}

function ImageSlot({
  label,
  fit,
  image,
  projectId,
  slideId,
  index,
  onChange,
}: {
  label: string;
  fit: 'cover' | 'contain';
  image: LabImage | undefined;
  projectId: string;
  slideId: string;
  index: number;
  onChange: (img: LabImage | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const src = resolveImageSrc(image);
  return (
    <div>
      <Label>{label}</Label>
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50"
        style={{ height: 120 }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: fit }} />
        ) : (
          <span className="text-[12px] text-neutral-400">Немає фото</span>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] text-neutral-600">
            Завантаження…
          </div>
        )}
      </div>
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-[#4a6cf7] px-3 py-1.5 text-[12.5px] font-medium text-white"
        >
          {src ? 'Замінити' : 'Завантажити'}
        </button>
        {src && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12.5px] text-neutral-600"
          >
            Прибрати
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            try {
              const img = await uploadLabImage(f, { projectId, slideId, index });
              onChange(img);
            } finally {
              setBusy(false);
              if (inputRef.current) inputRef.current.value = '';
            }
          }}
        />
      </div>
    </div>
  );
}

export default function LabFields({
  slide,
  projectId,
  onChange,
}: {
  slide: LabSlide;
  projectId: string;
  onChange: (patch: Partial<LabSlide>) => void;
}) {
  const setImage = (index: number, img: LabImage | null) => {
    const images = [...slide.images];
    while (images.length <= index) images.push({});
    if (img === null) images[index] = {};
    else images[index] = img;
    onChange({ images });
  };

  const imgFit: 'cover' | 'contain' = slide.subtype === 'screenshot' ? 'contain' : 'cover';
  const needsOneImage =
    (slide.type === 'text' && slide.picturePosition !== 'none') || slide.subtype === 'screenshot';
  const needsTwoImages = slide.subtype === 'before_after' || slide.subtype === 'point_ab';

  return (
    <div className="space-y-4">
      {slide.type === 'cover' && (
        <>
          <TextField label="Заголовок" value={slide.title} maxLength={LIMITS.coverTitle} onChange={(v) => onChange({ title: v })} />
          {slide.subtype === 'title_subtext' && (
            <TextArea label="Підзаголовок" value={slide.body} maxLength={LIMITS.coverSubtext} rows={3} onChange={(v) => onChange({ body: v })} />
          )}
        </>
      )}

      {slide.type === 'text' && (
        <>
          <TextField label="Заголовок" value={slide.title} maxLength={LIMITS.slideTitle} onChange={(v) => onChange({ title: v })} />
          {slide.subtype === 'paragraph' ? (
            <TextArea
              label="Текст (абзаци через порожній рядок)"
              value={slide.body}
              maxLength={LIMITS.body}
              rows={6}
              onChange={(v) => onChange({ body: v })}
            />
          ) : (
            <>
              <TextArea label="Вступ (над списком)" value={slide.body} maxLength={LIMITS.body} rows={2} onChange={(v) => onChange({ body: v })} />
              <BulletsEditor bullets={slide.bullets} onChange={(b) => onChange({ bullets: b })} />
              <TextArea label="Завершення (під списком)" value={slide.bodyAfter} maxLength={LIMITS.body} rows={2} onChange={(v) => onChange({ bodyAfter: v })} />
            </>
          )}
          {needsOneImage && (
            <ImageSlot label="Фото" fit="cover" image={slide.images[0]} projectId={projectId} slideId={slide.id} index={0} onChange={(img) => setImage(0, img)} />
          )}
        </>
      )}

      {slide.type === 'numbers' && (
        <>
          <TextField label="Показник (напр. 15.000$)" value={slide.statValue} maxLength={LIMITS.statValue} onChange={(v) => onChange({ statValue: v })} />
          <TextArea label="Підпис" value={slide.body} maxLength={LIMITS.statLabel} rows={3} onChange={(v) => onChange({ body: v })} />
        </>
      )}

      {slide.type === 'cta' && (
        <>
          <TextField label="Заголовок" value={slide.title} maxLength={LIMITS.slideTitle} onChange={(v) => onChange({ title: v })} />
          {slide.subtype === 'keyword' && (
            <TextField label="Ключове слово (в лапках)" value={slide.ctaKeyword} maxLength={LIMITS.ctaKeyword} onChange={(v) => onChange({ ctaKeyword: v })} />
          )}
          {slide.subtype === 'icons' && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
              Іконки поки заглушки — 4 кола-плейсхолдери (за ТЗ не підключаємо).
            </div>
          )}
          <TextArea label="Пояснення" value={slide.body} maxLength={LIMITS.body} rows={3} onChange={(v) => onChange({ body: v })} />
        </>
      )}

      {slide.type === 'testimonial' && slide.subtype !== 'point_ab' && (
        <>
          <TextField label="Заголовок" value={slide.title} maxLength={LIMITS.slideTitle} onChange={(v) => onChange({ title: v })} />
          <TextArea label="Підпис" value={slide.body} maxLength={LIMITS.body} rows={3} onChange={(v) => onChange({ body: v })} />
        </>
      )}

      {slide.subtype === 'point_ab' && (
        <>
          <TextField label="Мітка А" value={slide.points[0]?.label ?? ''} maxLength={20} onChange={(v) => onChange({ points: [{ label: v, text: slide.points[0]?.text ?? '' }, slide.points[1]] })} />
          <TextArea label="Текст А" value={slide.points[0]?.text ?? ''} maxLength={LIMITS.pointText} rows={3} onChange={(v) => onChange({ points: [{ label: slide.points[0]?.label ?? 'Точка А:', text: v }, slide.points[1]] })} />
          <TextField label="Мітка Б" value={slide.points[1]?.label ?? ''} maxLength={20} onChange={(v) => onChange({ points: [slide.points[0], { label: v, text: slide.points[1]?.text ?? '' }] })} />
          <TextArea label="Текст Б" value={slide.points[1]?.text ?? ''} maxLength={LIMITS.pointText} rows={3} onChange={(v) => onChange({ points: [slide.points[0], { label: slide.points[1]?.label ?? 'Точка Б:', text: v }] })} />
        </>
      )}

      {needsOneImage && slide.subtype === 'screenshot' && (
        <ImageSlot label="Скриншот (не обрізається)" fit="contain" image={slide.images[0]} projectId={projectId} slideId={slide.id} index={0} onChange={(img) => setImage(0, img)} />
      )}

      {needsTwoImages && (
        <div className="grid grid-cols-2 gap-3">
          <ImageSlot label={slide.subtype === 'before_after' ? 'До' : 'Фото А'} fit={imgFit} image={slide.images[0]} projectId={projectId} slideId={slide.id} index={0} onChange={(img) => setImage(0, img)} />
          <ImageSlot label={slide.subtype === 'before_after' ? 'Після' : 'Фото Б'} fit={imgFit} image={slide.images[1]} projectId={projectId} slideId={slide.id} index={1} onChange={(img) => setImage(1, img)} />
        </div>
      )}
    </div>
  );
}
