'use client';

import { useRef } from 'react';
import type { StorytellingStory, VisualType, EngagementType } from '@/lib/domain';
import { VISUAL_OPTIONS, ENGAGEMENT_OPTIONS } from '@/lib/domain';
import { updateStorytellingStory } from '@/app/storytelling-actions';

interface StoryCardProps {
  story: StorytellingStory;
  index: number;
  onUpdate: (storyId: string, updates: Partial<StorytellingStory>) => void;
  onDelete: (storyId: string) => void;
}

export default function StoryCard({ story, index, onUpdate, onDelete }: StoryCardProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextChange = (text: string) => {
    onUpdate(story.id, { text });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateStorytellingStory(story.id, { text });
    }, 500);
  };

  const toggleVisual = (option: VisualType) => {
    const value = story.visual === option ? null : option;
    onUpdate(story.id, { visual: value });
    updateStorytellingStory(story.id, { visual: value });
  };

  const toggleEngagement = (option: EngagementType) => {
    const value = story.engagement === option ? null : option;
    onUpdate(story.id, { engagement: value });
    updateStorytellingStory(story.id, { engagement: value });
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Сторіс {index + 1}
        </h3>
        <button
          type="button"
          onClick={() => onDelete(story.id)}
          className="cursor-pointer p-1 text-zinc-300 transition-colors hover:text-red-500"
          title="Видалити"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <textarea
        value={story.text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="Про що буде ця сторіс? Напишіть текст тут..."
        className="w-full resize-none bg-transparent text-sm leading-relaxed text-zinc-800 placeholder-zinc-300 focus:outline-none"
        rows={3}
      />

      <div className="flex flex-col gap-4 border-t border-zinc-50 pt-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l7-7 3 3-7 7-3-3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 2l5 5" />
              <circle cx="11" cy="11" r="2" />
            </svg>
            <span>Візуал</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VISUAL_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => toggleVisual(opt)}
                className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  story.visual === opt
                    ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200'
                    : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122M5.98 11.95l-2.121 2.122" />
            </svg>
            <span>Інтерактив</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ENGAGEMENT_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => toggleEngagement(opt)}
                className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  story.engagement === opt
                    ? 'bg-purple-50 text-purple-600 ring-1 ring-purple-200'
                    : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
