'use client';

import type { Slide, StoryInteractive, StoryVisual } from '@/lib/ai/rantToStories';

export type { Slide, StoryInteractive, StoryVisual };

interface StoryCardProps {
  slide: Slide;
  isFirst?: boolean;
  isLast?: boolean;
}

const visualStyles: Record<StoryVisual, string> = {
  'Говоряча голова': 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  'Відео в тему': 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  'Гарне фото': 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  'Кольоровий фон': 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
};

const interactiveStyles: Record<Exclude<StoryInteractive, null>, string> = {
  'Стікер': 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  'Тягнулка': 'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
  'Опитування': 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  'Заклик в директ': 'bg-[color:var(--accent-soft)] text-[color:var(--accent)] ring-1 ring-[color:var(--accent)]/25',
};

export default function StoryCard({ slide, isFirst = false, isLast = false }: StoryCardProps) {
  return (
    <article
      className={[
        'relative w-full rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-sm',
        'md:w-[320px] md:min-w-[320px]',
        isLast ? 'bg-[color:var(--accent-soft)]/30' : '',
      ].join(' ')}
    >
      {(isFirst || isLast) && (
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
          {isFirst && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
              🎬 Відкриття
            </span>
          )}
          {isLast && (
            <span className="rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-[11px] font-medium text-white">
              📩 CTA
            </span>
          )}
        </div>
      )}

      <div className="mb-3 flex items-center gap-2 pr-20">
        <span className="text-sm font-semibold text-zinc-900">{slide.slide_number}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${visualStyles[slide.visual]}`}>
          {slide.visual}
        </span>
      </div>

      <div className="rounded-xl border border-[color:var(--border)] bg-white px-3 py-4">
        <p className="whitespace-pre-line text-lg font-bold leading-snug text-zinc-900">{slide.screen_text}</p>
      </div>

      <div className="mt-3 border-t border-[color:var(--border)] pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Озвучення</p>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{slide.voiceover}</p>
      </div>

      {slide.interactive && (
        <div className="mt-3 border-t border-[color:var(--border)] pt-3">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${interactiveStyles[slide.interactive]}`}>
            🎯 {slide.interactive}
          </span>
        </div>
      )}

      {slide.notes?.trim() && (
        <div className="mt-3 border-t border-[color:var(--border)] pt-3">
          <p className="text-xs italic leading-relaxed text-zinc-600">💡 {slide.notes.trim()}</p>
        </div>
      )}
    </article>
  );
}
