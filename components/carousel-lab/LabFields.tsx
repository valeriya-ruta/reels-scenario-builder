'use client';

import { useRef, useState } from 'react';
import type { LabSlide, LabImage } from '@/lib/carousel-lab/types';
import { LIMITS } from '@/lib/carousel-lab/tokens';
import { uploadLabImage } from '@/lib/carousel-lab/uploadImage';
import { resolveImageSrc } from '@/lib/carousel-lab/imageResolve';
import AccentField from './AccentField';

const FIELD_CLASS = 'w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none focus:border-[#4a6cf7] placeholder:text-neutral-400 placeholder:opacity-50';
const AREA_CLASS = 'w-full resize-y rounded-lg border border-neutral-200 px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-[#4a6cf7] placeholder:text-neutral-400 placeholder:opacity-50';

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">{children}</div>;
}

function TextField({ label, value, onChange, maxLength, placeholder, accent = true }: { label: string; value: string; onChange: (v: string) => void; maxLength?: number; placeholder?: string; accent?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      {accent ? (
        <AccentField value={value} onChange={onChange} maxLength={maxLength} placeholder={placeholder} inputClassName={FIELD_CLASS} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} placeholder={placeholder} className={FIELD_CLASS} />
      )}
      {maxLength ? <div className="mt-0.5 text-right text-[11px] text-neutral-400">{value.length}/{maxLength}</div> : null}
    </div>
  );
}

function TextArea({ label, value, onChange, maxLength, rows = 4, hint, placeholder, accent = true }: { label: string; value: string; onChange: (v: string) => void; maxLength?: number; rows?: number; hint?: string; placeholder?: string; accent?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      {accent ? (
        <AccentField value={value} onChange={onChange} maxLength={maxLength} placeholder={placeholder} multiline rows={rows} inputClassName={AREA_CLASS} />
      ) : (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} rows={rows} placeholder={placeholder} className={AREA_CLASS} />
      )}
      <div className="mt-0.5 flex justify-between text-[11px] text-neutral-400">
        <span>{hint}</span>
        {maxLength ? <span>{value.length}/{maxLength}</span> : null}
      </div>
    </div>
  );
}

function BulletsEditor({ bullets, onChange, max }: { bullets: string[]; onChange: (b: string[]) => void; max?: number }) {
  const list = bullets.length ? bullets : [''];
  const atCap = !!max && list.length >= max;
  return (
    <div>
      <Label>Пункти списку{max ? ` (макс. ${max} з фото)` : ''}</Label>
      <div className="space-y-1.5">
        {list.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-5 text-center text-[12px] text-neutral-400">{i + 1}</span>
            <input
              value={b}
              onChange={(e) => {
                const next = [...list];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="flex-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-[#4a6cf7]"
            />
            <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className="rounded-md px-2 py-1 text-[12px] text-neutral-400 hover:bg-neutral-100">✕</button>
          </div>
        ))}
      </div>
      {atCap ? (
        <div className="mt-1.5 text-[11px] text-neutral-400">Зі фото на слайді — максимум {max} пунктів. Прибери фото, щоб додати більше.</div>
      ) : (
        <button type="button" onClick={() => onChange([...list, ''])} className="mt-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-1.5 text-[12.5px] text-neutral-500 hover:border-[#4a6cf7] hover:text-[#4a6cf7]">
          + Додати пункт
        </button>
      )}
    </div>
  );
}

function ImageSlot({ label, fit, image, projectId, slideId, index, onChange }: { label: string; fit: 'cover' | 'contain'; image: LabImage | undefined; projectId: string; slideId: string; index: number; onChange: (img: LabImage | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const src = resolveImageSrc(image);
  const t = image?.transform ?? { tx: 0, ty: 0, scale: 1 };
  const canZoom = !!src && fit === 'cover';
  const openPicker = () => inputRef.current?.click();
  const setScale = (scale: number) => {
    if (!image) return;
    const max = Math.max(0, (scale - 1) / 2);
    const clamp = (v: number) => Math.max(-max, Math.min(max, v));
    onChange({ ...image, transform: { tx: clamp(t.tx), ty: clamp(t.ty), scale } });
  };

  return (
    <div>
      <Label>{label}</Label>
      {/* Tap the box to open the picker (no separate blue button). */}
      <button
        type="button"
        onClick={openPicker}
        className="relative flex w-full select-none items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50 transition hover:border-[#4a6cf7]"
        style={{ height: 140 }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: fit, transformOrigin: 'center', transform: canZoom ? `translate(${t.tx * 100}%, ${t.ty * 100}%) scale(${t.scale})` : undefined }} />
        ) : (
          <span className="px-3 text-center text-[13px] text-neutral-400">Натисни, щоб додати фото</span>
        )}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] text-neutral-600">Завантаження…</div>}
      </button>

      {src && (
        <>
          {canZoom && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[11px] text-neutral-400">Масштаб</span>
              <input type="range" min={1} max={2.5} step={0.05} value={t.scale} onChange={(e) => setScale(parseFloat(e.target.value))} className="flex-1 accent-[#4a6cf7]" />
              {t.scale > 1 && (
                <button type="button" onClick={() => image && onChange({ ...image, transform: { tx: 0, ty: 0, scale: 1 } })} className="text-[11px] text-neutral-500 hover:text-[#4a6cf7]">Скинути</button>
              )}
            </div>
          )}
          <div className="mt-1.5 flex gap-2">
            <button type="button" onClick={openPicker} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12.5px] text-neutral-700 hover:bg-neutral-50">Змінити</button>
            <button type="button" onClick={() => onChange(null)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12.5px] text-neutral-600 hover:bg-neutral-50">Прибрати</button>
          </div>
          {canZoom && <div className="mt-0.5 text-[11px] text-neutral-400">Розташуй фото прямо на слайді: перетягни (або пінч/колесо для масштабу).</div>}
        </>
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
  );
}

/** Which image slots a slide needs. */
export function imageSlotCount(slide: LabSlide): number {
  if (slide.subtype === 'before_after' || slide.subtype === 'point_ab') return 2;
  if (slide.subtype === 'screenshot') return 1;
  if (slide.type === 'text' && slide.picturePosition !== 'none') return 1;
  return 0;
}

export default function LabFields({
  slide,
  projectId,
  onChange,
  section = 'all',
}: {
  slide: LabSlide;
  projectId: string;
  onChange: (patch: Partial<LabSlide>) => void;
  section?: 'text' | 'images' | 'all';
}) {
  const setImage = (index: number, img: LabImage | null) => {
    const images = [...slide.images];
    while (images.length <= index) images.push({});
    images[index] = img === null ? {} : img;
    onChange({ images });
  };

  const showText = section === 'text' || section === 'all';
  const showImages = section === 'images' || section === 'all';
  const imgFit: 'cover' | 'contain' = slide.subtype === 'screenshot' ? 'contain' : 'cover';
  const count = imageSlotCount(slide);

  const textFields = (
    <div className="space-y-4">
      {slide.type === 'cover' && (
        <>
          <TextField label="Заголовок" placeholder="ЯК Я ОБИРАЮ SPF" value={slide.title} maxLength={LIMITS.coverTitle} onChange={(v) => onChange({ title: v })} />
          {slide.subtype === 'title_subtext' && <TextArea label="Підзаголовок" placeholder="Короткий підзаголовок для обкладинки…" value={slide.body} maxLength={LIMITS.coverSubtext} rows={3} onChange={(v) => onChange({ body: v })} />}
        </>
      )}
      {slide.type === 'text' && (
        <>
          <TextField label="Заголовок" placeholder="Заголовок слайду…" value={slide.title} maxLength={LIMITS.slideTitle} onChange={(v) => onChange({ title: v })} />
          {slide.subtype === 'paragraph' ? (
            <TextArea label="Текст (абзаци через порожній рядок)" placeholder="Основний текст. Порожній рядок = новий абзац." value={slide.body} maxLength={LIMITS.body} rows={6} onChange={(v) => onChange({ body: v })} />
          ) : (
            <>
              <TextArea label="Вступ (над списком)" placeholder="Текст над списком…" value={slide.body} maxLength={LIMITS.body} rows={2} onChange={(v) => onChange({ body: v })} />
              <BulletsEditor bullets={slide.bullets} onChange={(b) => onChange({ bullets: b })} max={slide.picturePosition !== 'none' ? 5 : undefined} />
              <TextArea label="Завершення (під списком)" placeholder="Текст під списком…" value={slide.bodyAfter} maxLength={LIMITS.body} rows={2} onChange={(v) => onChange({ bodyAfter: v })} />
            </>
          )}
        </>
      )}
      {slide.type === 'numbers' && (
        <>
          <TextField label="Показник (напр. 15.000$)" placeholder="15.000$" accent={false} value={slide.statValue} maxLength={LIMITS.statValue} onChange={(v) => onChange({ statValue: v })} />
          <TextArea label="Підпис" placeholder="Що означає ця цифра…" value={slide.body} maxLength={LIMITS.statLabel} rows={3} onChange={(v) => onChange({ body: v })} />
        </>
      )}
      {slide.type === 'cta' && (
        <>
          <TextField label="Заголовок" placeholder="НАПИШИ В КОМЕНТАРІ / ДІРЕКТ…" value={slide.title} maxLength={LIMITS.slideTitle} onChange={(v) => onChange({ title: v })} />
          {slide.subtype === 'keyword' && <TextField label="Ключове слово (в лапках)" placeholder="ДІЄТА" accent={false} value={slide.ctaKeyword} maxLength={LIMITS.ctaKeyword} onChange={(v) => onChange({ ctaKeyword: v })} />}
          {slide.subtype === 'icons' && <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">Іконки — заглушки (4 кола-плейсхолдери).</div>}
          <TextArea label="Пояснення" placeholder="Щоб отримати безкоштовний гайд…" value={slide.body} maxLength={LIMITS.body} rows={3} onChange={(v) => onChange({ body: v })} />
        </>
      )}
      {slide.type === 'testimonial' && slide.subtype !== 'point_ab' && (
        <>
          <TextField label="Заголовок" placeholder={slide.subtype === 'before_after' ? 'До та після:' : 'Відгук клієнтки:'} value={slide.title} maxLength={LIMITS.slideTitle} onChange={(v) => onChange({ title: v })} />
          <TextArea label="Підпис" placeholder="Підпис до фото…" value={slide.body} maxLength={LIMITS.body} rows={3} onChange={(v) => onChange({ body: v })} />
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
    </div>
  );

  const imageSlots =
    count === 0 ? (
      <p className="rounded-lg bg-[color:var(--surface)] px-3 py-2 text-[12.5px] text-zinc-500">Цей тип слайду не має фото.</p>
    ) : count === 1 ? (
      <ImageSlot
        label={slide.subtype === 'screenshot' ? 'Скріншот (не обрізається)' : 'Фото'}
        fit={imgFit}
        image={slide.images[0]}
        projectId={projectId}
        slideId={slide.id}
        index={0}
        onChange={(img) => setImage(0, img)}
      />
    ) : (
      <div className="grid grid-cols-2 gap-3">
        <ImageSlot label={slide.subtype === 'before_after' ? 'До' : 'Фото А'} fit={imgFit} image={slide.images[0]} projectId={projectId} slideId={slide.id} index={0} onChange={(img) => setImage(0, img)} />
        <ImageSlot label={slide.subtype === 'before_after' ? 'Після' : 'Фото Б'} fit={imgFit} image={slide.images[1]} projectId={projectId} slideId={slide.id} index={1} onChange={(img) => setImage(1, img)} />
      </div>
    );

  return (
    <div className="space-y-4">
      {showText && textFields}
      {showImages && (
        <div className="space-y-3">
          {section === 'all' && count > 0 && <div className="h-px bg-neutral-100" />}
          {imageSlots}
          <p className="text-[11px] text-zinc-400">Фон стилю Modern Elegant фіксований (#BCC7AB) — змінюється лише фото у слотах.</p>
        </div>
      )}
    </div>
  );
}
