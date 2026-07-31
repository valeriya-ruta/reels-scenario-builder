'use client';

import { useRef, useState } from 'react';
import { Check, Copy, Sliders, X } from 'lucide-react';
import type { StorytellingStory, VisualType, EngagementType } from '@/lib/domain';
import { VISUAL_OPTIONS, ENGAGEMENT_OPTIONS } from '@/lib/domain';
import { updateStorytellingStory } from '@/app/storytelling-actions';

/**
 * One story card — a READING surface first, a form second.
 *
 * A story is narrative text the user will read aloud to camera, so the text is
 * the hero: editorial size, generous leading, nothing competing with it. The
 * visual/interactive choices are production machinery; they are FELT as a quiet
 * meta line showing what is set, and only unfold into the full option chips when
 * the user asks. Previously both option groups were permanently open under every
 * card, so eight chips of machinery outweighed the writing on every screen.
 */

function formatStoryAsText(story: StorytellingStory, index: number): string {
  const body = (story.text || '').trim() || '—';
  const visual = story.visual ?? '—';
  const engagement = story.engagement ?? '—';
  return [`Сторіс ${index + 1}`, body, `Візуал: ${visual}`, `Інтерактив: ${engagement}`].join('\n');
}

interface StoryCardProps {
  story: StorytellingStory;
  index: number;
  onUpdate: (storyId: string, updates: Partial<StorytellingStory>) => void;
  onDelete: (storyId: string) => void;
}

export default function StoryCard({ story, index, onUpdate, onDelete }: StoryCardProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const copyStoryText = async () => {
    try {
      await navigator.clipboard.writeText(formatStoryAsText(story, index));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be denied
    }
  };

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

  const setChips = [story.visual, story.engagement].filter(Boolean) as string[];

  return (
    <div className="app-card flex flex-col p-5 transition-shadow hover:shadow-[var(--elev-2)]">
      {/* The index is a quiet numeral, not a heading competing with the text. */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-bold tabular-nums text-[color:var(--text-muted)]">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100">
          <button
            type="button"
            onClick={copyStoryText}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
            title={copied ? 'Скопійовано' : 'Копіювати текст сторіс'}
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.2} />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={1.7} />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDelete(story.id)}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-red-500"
            title="Видалити"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* The writing. Editorial size + leading — this is what gets read aloud. */}
      <textarea
        value={story.text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="Про що ця сторіс? Пиши, як говориш…"
        className="mt-1 w-full resize-none bg-transparent text-[17px] leading-[1.62] tracking-[-0.01em] text-[color:var(--foreground)] placeholder-zinc-300 focus:outline-none"
        rows={4}
      />

      {/* Machinery, felt not shown: what's set, and a way in. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[color:var(--border)] pt-3">
        {setChips.map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-[color:var(--surface1)] px-2.5 py-1 text-[11.5px] font-medium text-[color:var(--text-secondary)]"
          >
            {chip}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          data-testid="story-options-toggle"
          aria-expanded={showOptions}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-medium text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface1)] hover:text-[color:var(--foreground)]"
        >
          <Sliders className="h-3.5 w-3.5" strokeWidth={2} />
          {setChips.length === 0 ? 'Візуал та інтерактив' : 'Змінити'}
        </button>
      </div>

      {showOptions ? (
        <div className="mt-3 flex flex-col gap-3" data-testid="story-options">
          <div className="flex flex-col gap-1.5">
            <span className="app-section-label">Візуал</span>
            <div className="flex flex-wrap gap-1.5">
              {VISUAL_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleVisual(opt)}
                  className={`cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    story.visual === opt
                      ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                      : 'bg-[color:var(--surface1)] text-zinc-500 hover:bg-[color:var(--surface2)]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="app-section-label">Інтерактив</span>
            <div className="flex flex-wrap gap-1.5">
              {ENGAGEMENT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleEngagement(opt)}
                  className={`cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    story.engagement === opt
                      ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                      : 'bg-[color:var(--surface1)] text-zinc-500 hover:bg-[color:var(--surface2)]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
