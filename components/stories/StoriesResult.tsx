'use client';

import { useState } from 'react';
import type { Slide, StoriesOutput } from '@/lib/ai/rantToStories';
import StoryCard from '@/components/stories/StoryCard';

export type { StoriesOutput };

const templateEmoji: Record<StoriesOutput['template_used'], string> = {
  A: '📖',
  B: '💰',
  C: '🔥',
  D: '🎬',
};

function buildCopyText(slides: Slide[]): string {
  return slides
    .map((slide) =>
      [
        `Слайд ${slide.slide_number} (${slide.visual})`,
        `Екран: ${slide.screen_text}`,
        `Інтерактив: ${slide.interactive ?? '—'}`,
      ].join('\n'),
    )
    .join('\n\n');
}

export default function StoriesResult({ data }: { data: StoriesOutput }) {
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText(data.slides));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700">
          {templateEmoji[data.template_used]} Шаблон {data.template_used} — {data.template_name}
        </span>
        <button
          type="button"
          onClick={() => void copyAll()}
          className="rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)]"
        >
          {copied ? 'Скопійовано ✓' : 'Копіювати все'}
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:overflow-x-auto md:pb-2">
        {data.slides.map((slide, index) => (
          <StoryCard
            key={`${slide.slide_number}-${slide.one_thought}`}
            slide={slide}
            isFirst={index === 0}
            isLast={index === data.slides.length - 1}
          />
        ))}
      </div>
    </section>
  );
}
