'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { LabSlide, LabSlideType, LabSubtype, LabVariant, LabPicturePosition } from '@/lib/carousel-lab/types';
import { createSlide } from '@/lib/carousel-lab/defaults';
import LabSlideCanvas from './LabSlideCanvas';

// Top-level groups (chips). Each maps to one slide type; each opens a scrollable
// list of that type's subtypes as visual cards (live Modern Elegant previews).
const GROUPS: { type: LabSlideType; label: string }[] = [
  { type: 'cover', label: 'Обкладинка' },
  { type: 'text', label: 'Контент' },
  { type: 'numbers', label: 'Цифри' },
  { type: 'testimonial', label: 'Скріншот / Відгук' },
  { type: 'cta', label: 'Заклик' },
];

type Card = { subtype: LabSubtype; variant?: LabVariant; label: string; section?: string };

const CARDS: Record<LabSlideType, Card[]> = {
  cover: [
    { subtype: 'title', label: 'Тільки заголовок' },
    { subtype: 'title_subtext', label: 'Заголовок + підзаголовок' },
  ],
  text: [
    { subtype: 'paragraph', label: 'Простий' },
    { subtype: 'bullets', label: 'Список' },
    { subtype: 'numbered', label: 'Нумерований' },
  ],
  numbers: [{ subtype: 'stat', label: 'Показник' }],
  testimonial: [
    { subtype: 'screenshot', label: 'Текстовий відгук' },
    { subtype: 'before_after', label: 'До / Після' },
    { subtype: 'point_ab', variant: 'diagonal', label: 'Точка А → Б' },
  ],
  cta: [
    { subtype: 'keyword', label: 'Ключове слово' },
    { subtype: 'icons', label: 'Дія + іконки' },
  ],
};

/** A short sample slide so a card previews the real layout. */
function previewSlide(type: LabSlideType, card: Card, pos: LabPicturePosition): LabSlide {
  const s = createSlide(type, card.subtype, { variant: card.variant, picturePosition: type === 'text' ? pos : 'none' });
  s.title = 'Заголовок';
  s.body =
    type === 'cover' ? 'Підзаголовок тут' :
    type === 'numbers' ? 'Короткий підпис' :
    type === 'cta' ? 'Пояснення для дії' :
    'Короткий абзац тексту для прикладу.';
  s.bullets = ['Пункт перший', 'Пункт другий', 'Пункт третій'];
  s.statValue = '72%';
  s.ctaKeyword = 'Слово';
  s.points = [
    { label: 'Точка А:', text: 'Було отак' },
    { label: 'Точка Б:', text: 'Стало отак' },
  ];
  if (card.subtype === 'screenshot') s.images = [{}];
  if (card.subtype === 'before_after' || card.subtype === 'point_ab') s.images = [{}, {}];
  if (type === 'text' && pos !== 'none') s.images = [{}];
  return s;
}

export default function LabTypeTab({
  slide,
  onChange,
}: {
  slide: LabSlide;
  onChange: (patch: Partial<LabSlide>) => void;
}) {
  const cards = CARDS[slide.type] ?? [];

  function pickGroup(type: LabSlideType) {
    if (type === slide.type) return;
    const first = CARDS[type][0];
    onChange({
      type,
      subtype: first.subtype,
      variant: (first.variant ?? 'default') as LabVariant,
      picturePosition: 'none',
    });
  }
  function pickCard(card: Card) {
    onChange({
      subtype: card.subtype,
      variant: (card.variant ?? 'default') as LabVariant,
    });
  }
  const isCardActive = (c: Card) =>
    c.subtype === slide.subtype && (c.variant ? c.variant === slide.variant : true);

  const previews = useMemo(
    () => cards.map((c) => ({ card: c, slide: previewSlide(slide.type, c, slide.picturePosition) })),
    [cards, slide.type, slide.picturePosition],
  );

  return (
    <div className="space-y-4">
      {/* top group chips */}
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GROUPS.map((g) => {
          const active = g.type === slide.type;
          return (
            <button
              key={g.type}
              type="button"
              onClick={() => pickGroup(g.type)}
              className={
                active
                  ? 'shrink-0 rounded-full bg-[#4a6cf7] px-4 py-2 text-[13px] font-semibold text-white'
                  : 'shrink-0 rounded-full bg-[#f1f1f4] px-4 py-2 text-[13px] font-medium text-zinc-700'
              }
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {/* subtype cards — text shows 3 rows (no photo / photo up / photo down) */}
      {slide.type === 'text'
        ? ([
            { pos: 'none', label: 'Без фото' },
            { pos: 'up', label: 'Фото зверху' },
            { pos: 'down', label: 'Фото знизу' },
          ] as { pos: LabPicturePosition; label: string }[]).map((row) => (
            <div key={row.pos}>
              <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">{row.label}</div>
              <div className="grid grid-cols-3 gap-2">
                {CARDS.text.map((card) => (
                  <CardBtn
                    key={card.label + row.pos}
                    ps={previewSlide('text', card, row.pos)}
                    label={card.label}
                    active={slide.subtype === card.subtype && slide.picturePosition === row.pos}
                    onClick={() => onChange({ type: 'text', subtype: card.subtype, variant: 'default', picturePosition: row.pos })}
                  />
                ))}
              </div>
            </div>
          ))
        : (
          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
              {GROUPS.find((g) => g.type === slide.type)?.label}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {previews.map(({ card, slide: ps }) => (
                <CardBtn key={card.label} ps={ps} label={card.label} active={isCardActive(card)} onClick={() => pickCard(card)} />
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

function CardBtn({ ps, label, active, onClick }: { ps: LabSlide; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative rounded-lg border bg-white p-1 text-left transition"
      style={{ borderColor: active ? '#4a6cf7' : '#e6e6ea', boxShadow: active ? '0 0 0 2px #4a6cf7' : 'none' }}
    >
      <div className="overflow-hidden rounded-md" style={{ pointerEvents: 'none' }}>
        <LabSlideCanvas slide={ps} renderWidth={92} rounded={6} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-0.5 px-0.5">
        <span className="truncate text-[10.5px] font-medium leading-tight text-zinc-800">{label}</span>
        {active && (
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#4a6cf7] text-white">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        )}
      </div>
    </button>
  );
}
