'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Pencil, Plus, X } from 'lucide-react';
import type { StorytellingStory } from '@/lib/domain';
import type { BoardDay } from '@/lib/storytelling/board';
import StoryCard from '@/components/StoryCard';
import ScheduleChip from '@/components/content/ScheduleChip';
import StatusPill from '@/components/content/StatusPill';
import { displayTitle } from '@/lib/content/displayTitle';

/**
 * One column of the storytelling board = one storytelling = one day.
 *
 * The header carries what makes it a day of its own: its name, its STATUS and
 * its DATE. Both chips write to `storytelling_projects` — the same row every
 * other surface reads — so a date set here lands on План and a status set here
 * moves the ring in Контент, with nothing to sync.
 */

interface Props {
  day: BoardDay;
  /** Position on the board (0-based) — the «1 / 2 / 3» chip and move bounds. */
  index: number;
  dayCount: number;
  onRename: (dayId: string, name: string) => void;
  onCopy: (dayId: string) => void;
  onDelete: (dayId: string) => void;
  onMove: (dayId: string, direction: -1 | 1) => void;
  onAddStory: (dayId: string) => void;
  onUpdateStory: (dayId: string, storyId: string, updates: Partial<StorytellingStory>) => void;
  onDeleteStory: (dayId: string, storyId: string) => void;
  onMoveStory: (dayId: string, fromIndex: number, toIndex: number) => void;
  copied: boolean;
}

export default function DayColumn({
  day,
  index,
  dayCount,
  onRename,
  onCopy,
  onDelete,
  onMove,
  onAddStory,
  onUpdateStory,
  onDeleteStory,
  onMoveStory,
  copied,
}: Props) {
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState('');
  const { project, stories } = day;
  const isSet = dayCount > 1;

  const commitName = () => {
    setEditingName(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === project.name) return;
    onRename(project.id, trimmed);
  };

  return (
    <div
      data-testid="story-column"
      data-day-id={project.id}
      // A lone story keeps a comfortable reading width — it is being written, not
      // scanned — while still sitting in the board's row so the «+» column is
      // visible beside it. Columns of a set are narrower and snap one at a time.
      className={
        isSet
          ? 'flex w-[86vw] shrink-0 snap-start flex-col sm:w-[360px]'
          // 80vw, not the full width: the «+» column has to peek in from the
          // right, or on a phone the board looks like a single page again and
          // the whole point is invisible.
          : 'flex w-[80vw] shrink-0 snap-start flex-col sm:w-[min(560px,60vw)]'
      }
    >
      <div className="mb-3 px-1">
        {/* A board of one has nothing to number, name twice, reorder or delete —
            its name is the page title and its cards are the whole screen. So the
            column chrome appears only once there is more than one day. */}
        {isSet && (
        <div className="group flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="inline-flex h-[22px] shrink-0 items-center justify-center rounded-[7px] bg-[color:var(--accent-soft)] px-2 text-[11px] font-bold tabular-nums text-[color:var(--accent)]">
              {index + 1}
            </span>
            {editingName ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                aria-label="Назва історії"
                data-testid="day-name-input"
                className="min-w-0 flex-1 rounded-[8px] border border-[color:var(--border-strong)] bg-white px-2 py-1 text-[14px] font-bold tracking-tight text-[color:var(--foreground)] outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(displayTitle(project.name, 'story'));
                  setEditingName(true);
                }}
                data-testid="day-name"
                title="Перейменувати"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[8px] px-1 py-0.5 text-left transition-colors hover:bg-[color:var(--surface1)]"
              >
                <span className="truncate text-[15px] font-bold tracking-tight text-[color:var(--foreground)]">
                  {displayTitle(project.name, 'story')}
                </span>
                <Pencil className="h-3 w-3 shrink-0 text-[color:var(--text-muted)]" strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => onMove(project.id, -1)}
              disabled={index === 0}
              aria-label="Раніше"
              title="Перемістити ліворуч"
              className="cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onMove(project.id, 1)}
              disabled={index === dayCount - 1}
              aria-label="Пізніше"
              title="Перемістити праворуч"
              className="cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onCopy(project.id)}
              aria-label="Копіювати сторіс цього дня"
              title={copied ? 'Скопійовано' : 'Копіювати сторіс цього дня'}
              className={`cursor-pointer rounded-md p-1.5 transition-colors ${
                copied ? 'text-emerald-600' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
              }`}
            >
              {copied ? <Check className="h-4 w-4" strokeWidth={2.2} /> : <Copy className="h-4 w-4" strokeWidth={1.7} />}
            </button>
            <button
              type="button"
              onClick={() => onDelete(project.id)}
              data-testid="delete-day"
              aria-label="Видалити історію"
              title="Видалити цю історію"
              className="cursor-pointer rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-red-500"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
        )}

        {/* The day's own date + status. Same row every list and the calendar
            read, so this is the piece's real schedule, not a board-local note. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill
            key={`status-${project.id}`}
            refTable="storytelling_projects"
            id={project.id}
            type="story"
            initialStatus={project.status ?? 'idea'}
          />
          <ScheduleChip
            // Re-keyed on the date so a server-proposed day (a freshly added
            // column starts undated on screen) lands in the chip.
            key={`date-${project.id}-${project.scheduled_date ?? ''}`}
            refTable="storytelling_projects"
            id={project.id}
            initialDate={project.scheduled_date ?? null}
          />
        </div>

        {/* On a board of one the page's own counter already says this. */}
        {isSet && (
          <p className="mt-2 text-[12px] font-medium text-[color:var(--text-muted)]">
            {stories.length} сторіс
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4" data-testid="story-list">
        {stories.map((story, storyIndex) => (
          <div key={story.id} className="group/wrapper relative">
            <div className="absolute -left-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 opacity-0 transition-opacity group-hover/wrapper:opacity-100">
              {storyIndex > 0 && (
                <button
                  type="button"
                  aria-label="Вище"
                  onClick={() => onMoveStory(project.id, storyIndex, storyIndex - 1)}
                  className="cursor-pointer rounded-full border border-zinc-200 bg-white p-1 shadow-sm transition-colors hover:bg-zinc-50"
                >
                  <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
              {storyIndex < stories.length - 1 && (
                <button
                  type="button"
                  aria-label="Нижче"
                  onClick={() => onMoveStory(project.id, storyIndex, storyIndex + 1)}
                  className="cursor-pointer rounded-full border border-zinc-200 bg-white p-1 shadow-sm transition-colors hover:bg-zinc-50"
                >
                  <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
            <StoryCard
              story={story}
              index={storyIndex}
              onUpdate={(storyId, updates) => onUpdateStory(project.id, storyId, updates)}
              onDelete={(storyId) => onDeleteStory(project.id, storyId)}
            />
          </div>
        ))}

        {/* Only on a set. With one column the bottom bar's «Додати сторіс» is
            already unambiguous, and two add-buttons three letters apart stacked
            on top of each other is the duplicate that had to go. */}
        {isSet && (
          <button
            type="button"
            onClick={() => onAddStory(project.id)}
            data-testid="add-story"
            className="flex cursor-pointer items-center justify-center gap-2 rounded-[16px] border-2 border-dashed border-[color:var(--border)] bg-[color:var(--surface1)]/60 p-4 text-sm font-medium text-zinc-500 transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface1)]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            Додати сторіс
          </button>
        )}
      </div>
    </div>
  );
}
