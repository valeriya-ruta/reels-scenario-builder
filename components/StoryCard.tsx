'use client';

import { useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { StorytellingStory, VisualType, EngagementType } from '@/lib/domain';
import { VISUAL_OPTIONS, ENGAGEMENT_OPTIONS } from '@/lib/domain';
import { updateStorytellingStory } from '@/app/storytelling-actions';
import { useTapGuard } from '@/lib/ui/tapGuard';

/**
 * One story card — a READING surface first, a form second.
 *
 * A story is narrative text the user will read aloud to camera, so the text is
 * the hero: editorial size, generous leading, nothing competing with it.
 *
 * Візуал + Інтерактив sit directly under it as a PRIMARY surface. Round 1 hid
 * them behind a «Змінити» toggle on the theory that they were machinery; they
 * are not — how a story looks and how it invites a reply is half the craft, and
 * hiding them made every card a decision you had to reopen (§3).
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

      {/* Візуал + Інтерактив are a PRIMARY surface, not machinery hidden behind
          a toggle (§3). Round 1 collapsed them and that was wrong: how a story
          looks and how it invites a reply are half the craft, and burying them
          behind «Змінити» made every card a decision the user had to reopen. */}
      <div className="mt-3 flex flex-col gap-3 border-t border-[color:var(--border)] pt-3">
        <div className="flex flex-col gap-1.5">
          <span className="app-section-label">Візуал</span>
          <div className="flex flex-wrap gap-1.5">
            {VISUAL_OPTIONS.map((opt) => (
              <OptionChip
                key={opt}
                label={opt}
                selected={story.visual === opt}
                onToggle={() => toggleVisual(opt)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="app-section-label">Інтерактив</span>
          <div className="flex flex-wrap gap-1.5">
            {ENGAGEMENT_OPTIONS.map((opt) => (
              <OptionChip
                key={opt}
                label={opt}
                selected={story.engagement === opt}
                onToggle={() => toggleEngagement(opt)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One visual/interaction choice. Tap-guarded: these live in a scrolling list. */
function OptionChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const tap = useTapGuard(onToggle);
  return (
    <button
      type="button"
      {...tap}
      aria-pressed={selected}
      className={`cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
        selected
          ? 'bg-[color:var(--accent)] text-white'
          : 'bg-[color:var(--surface1)] text-zinc-600 hover:bg-[color:var(--surface2)]'
      }`}
    >
      {label}
    </button>
  );
}
