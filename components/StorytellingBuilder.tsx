'use client';

import { useState, useCallback, useMemo } from 'react';
import { Check, Copy, Plus } from 'lucide-react';
import type {
  StorytellingProject,
  StorytellingColumn,
  StorytellingStory,
} from '@/lib/domain';
import {
  updateStorytellingProjectName,
  createStorytellingStory,
  deleteStorytellingStory,
  reorderStorytellingStories,
} from '@/app/storytelling-actions';
import StoryCard from './StoryCard';
import EditorTopBar from '@/components/ui/EditorTopBar';
import SetNav, { type SetSibling } from '@/components/storytelling/SetNav';
import { genClientId, nextOrderIndex, makeOptimisticStory } from '@/lib/storytelling/optimistic';
import { flattenStories, primaryColumnId } from '@/lib/storytelling/single';
import ScheduleChip from '@/components/content/ScheduleChip';
import StatusPill from '@/components/content/StatusPill';
import SourceDumpChip from '@/components/braindump/SourceDumpChip';

/**
 * ONE storytelling = ONE dated, self-contained piece (§3, de-projectify).
 *
 * The board used to render N side-by-side columns with an «Додати сторітел»
 * button — several storytellings nested inside one object, which was never the
 * agreed model and breaks dating (a single `scheduled_date` cannot stand for
 * several days of posting). A multi-day generation is already N SIBLING
 * projects, one per day (see `createStorytellingProjectFromRant` + migration
 * 025), so the nesting was pure legacy.
 *
 * This is now a single vertical run of story cards. `storytelling_columns` stays
 * in the schema — no migration — but the app treats it as an implementation
 * detail: legacy rows spread across several columns are FLATTENED into one list
 * in column order so nothing is lost or hidden, and new cards always append to
 * the first column.
 */

interface Props {
  project: StorytellingProject;
  initialColumns: StorytellingColumn[];
  initialStories: StorytellingStory[];
  /** Other days of the same generated saga (empty when this is a standalone). */
  siblings?: SetSibling[];
}

function formatStoriesAsText(name: string, stories: StorytellingStory[]): string {
  const blocks = stories.map((s, i) =>
    [
      `Сторіс ${i + 1}`,
      (s.text || '').trim() || '—',
      `Візуал: ${s.visual ?? '—'}`,
      `Інтерактив: ${s.engagement ?? '—'}`,
    ].join('\n'),
  );
  return `${name}\n\n${blocks.join('\n\n')}`;
}

export default function StorytellingBuilder({
  project: initialProject,
  initialColumns,
  initialStories,
  siblings = [],
}: Props) {
  const [project, setProject] = useState(initialProject);
  const [stories, setStories] = useState<StorytellingStory[]>(() =>
    flattenStories(initialColumns, initialStories),
  );
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Where new cards go. Legacy projects may carry several columns; the first in
  // order is the canonical one and the rest are only read from.
  const columnId = useMemo(() => primaryColumnId(initialColumns), [initialColumns]);

  const showError = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 3500);
  }, []);

  const handleRename = useCallback(
    async (next: string) => {
      setProject((p) => ({ ...p, name: next }));
      await updateStorytellingProjectName(project.id, next);
    },
    [project.id],
  );

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatStoriesAsText(project.name, stories));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be denied (non-secure context) */
    }
  }, [project.name, stories]);

  // Optimistic: render the card instantly under a client-generated id, persist
  // in the background. StoryCard autosaves to that same id (a real row), so
  // edits made before the insert resolves are never lost.
  const handleAddStory = useCallback(() => {
    if (!columnId) {
      showError('Не вдалося додати сторіс — онови сторінку.');
      return;
    }
    const storyId = genClientId();
    const orderIndex = nextOrderIndex(stories);
    setStories((prev) => [...prev, makeOptimisticStory(columnId, orderIndex, storyId)]);

    void createStorytellingStory(columnId, orderIndex, storyId)
      .then((story) => {
        if (!story) throw new Error('insert failed');
      })
      .catch(() => {
        setStories((prev) => prev.filter((s) => s.id !== storyId));
        showError('Не вдалося додати сторіс. Спробуй ще раз.');
      });
  }, [columnId, stories, showError]);

  const handleDeleteStory = useCallback((storyId: string) => {
    setStories((prev) => prev.filter((s) => s.id !== storyId));
    void deleteStorytellingStory(storyId);
  }, []);

  const handleUpdateStory = useCallback((storyId: string, updates: Partial<StorytellingStory>) => {
    setStories((prev) => prev.map((s) => (s.id === storyId ? { ...s, ...updates } : s)));
  }, []);

  const moveStory = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (toIndex < 0 || toIndex >= stories.length) return;
      const next = [...stories];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setStories(next);
      // Flattened legacy cards keep their own column_id, so persist the new
      // order per owning column rather than assuming a single one.
      const byColumn = new Map<string, string[]>();
      for (const s of next) {
        const arr = byColumn.get(s.column_id) ?? [];
        arr.push(s.id);
        byColumn.set(s.column_id, arr);
      }
      for (const [col, ids] of byColumn) void reorderStorytellingStories(col, ids);
    },
    [stories],
  );

  return (
    <div className="app-canvas min-h-screen">
      {toast && (
        <div
          role="status"
          data-testid="storytelling-toast"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      )}

      <div className="app-page pb-28">
        <EditorTopBar
          backHref="/storytellings"
          title={project.name}
          kind="story"
          onRename={handleRename}
          meta={
            <>
              <StatusPill
                refTable="storytelling_projects"
                id={project.id}
                type="story"
                initialStatus={project.status ?? 'idea'}
              />
              <ScheduleChip
                refTable="storytelling_projects"
                id={project.id}
                initialDate={project.scheduled_date ?? null}
              />
              <SourceDumpChip contentId={project.id} />
            </>
          }
        />

        <SetNav siblings={siblings} currentId={project.id} />

        <p className="mb-4 mt-1 px-1 text-[12.5px] font-medium text-[color:var(--text-muted)]">
          {stories.length} сторіс · одна історія на день
        </p>

        {/* One vertical run of story cards — no columns, no nesting. */}
        <div className="flex flex-col gap-4" data-testid="story-list">
          {stories.map((story, index) => (
            <div key={story.id} className="group/wrapper relative">
              <div className="absolute -left-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 opacity-0 transition-opacity group-hover/wrapper:opacity-100">
                {index > 0 && (
                  <button
                    type="button"
                    aria-label="Вище"
                    onClick={() => moveStory(index, index - 1)}
                    className="cursor-pointer rounded-full border border-zinc-200 bg-white p-1 shadow-sm transition-colors hover:bg-zinc-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polyline points="18 15 12 9 6 15" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
                {index < stories.length - 1 && (
                  <button
                    type="button"
                    aria-label="Нижче"
                    onClick={() => moveStory(index, index + 1)}
                    className="cursor-pointer rounded-full border border-zinc-200 bg-white p-1 shadow-sm transition-colors hover:bg-zinc-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polyline points="6 9 12 15 18 9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
              <StoryCard
                story={story}
                index={index}
                onUpdate={(storyId, updates) => handleUpdateStory(storyId, updates)}
                onDelete={handleDeleteStory}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Repeated actions in the thumb zone (§1), not the top corners. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--border)] bg-[color:var(--background)]/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur"
        style={{ boxShadow: '0 -2px 20px rgba(0,0,0,0.06)' }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button
            type="button"
            onClick={handleAddStory}
            data-testid="add-story"
            className="app-btn-primary flex-1"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            Додати сторіс
          </button>
          <button
            type="button"
            onClick={copyAll}
            aria-label="Копіювати всі сторіс"
            title={copied ? 'Скопійовано' : 'Копіювати всі сторіс'}
            className="app-icon-btn"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.4} />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
