'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Plus } from 'lucide-react';
import type { StorytellingStory } from '@/lib/domain';
import {
  addStorytellingDay,
  createStorytellingStory,
  deleteStorytellingStory,
  removeStorytellingDay,
  reorderStorytellingDays,
  reorderStorytellingStories,
  updateStorytellingProjectName,
  type SetTag,
} from '@/app/storytelling-actions';
import EditorTopBar from '@/components/ui/EditorTopBar';
import DayColumn from '@/components/storytelling/DayColumn';
import SourceDumpChip from '@/components/braindump/SourceDumpChip';
import { genClientId, nextOrderIndex, makeOptimisticStory } from '@/lib/storytelling/optimistic';
import {
  boardSummary,
  dayName,
  nextSetIndex,
  renameSetStem,
  setTitle,
  totalStories,
  type BoardDay,
} from '@/lib/storytelling/board';
import { displayTitle } from '@/lib/content/displayTitle';
import { dayHeaderLabel } from '@/lib/content/calendar';
import { onStorytellingAutoNamed } from '@/lib/storytelling/autoNameEvent';

/**
 * The storytelling board — several storytellings side by side, one per day.
 *
 * ── What changed, and why it is not the old board ─────────────────────────
 * The original board nested N columns inside ONE project. That is why it was
 * removed: the project held a single `scheduled_date`, so a three-day saga had
 * one date between three days of posting, and a column had no status at all.
 *
 * A column here is a whole storytelling instead — its own row, its own date, its
 * own status — and the columns of one board are the days of one set (`set_id`,
 * migration 025). So the multi-column planning view is back WITHOUT the thing
 * that broke it: each column schedules itself onto План and moves its own status
 * ring, because those chips write the same row every other surface reads.
 *
 * A standalone storytelling is simply a board of one; «Додати сторітел» turns it
 * into a set of two.
 */

interface Props {
  initialDays: BoardDay[];
  /** The day whose id is in the URL — the source-dump chip belongs to it. */
  currentId: string;
}

function formatDayAsText(day: BoardDay): string {
  const heading = [
    displayTitle(day.project.name, 'story'),
    day.project.scheduled_date ? dayHeaderLabel(day.project.scheduled_date) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const blocks = day.stories.map((s, i) =>
    [
      `Сторіс ${i + 1}`,
      (s.text || '').trim() || '—',
      `Візуал: ${s.visual ?? '—'}`,
      `Інтерактив: ${s.engagement ?? '—'}`,
    ].join('\n'),
  );

  return `${heading}\n\n${blocks.join('\n\n')}`;
}

export default function StorytellingBuilder({ initialDays, currentId }: Props) {
  const router = useRouter();
  const [days, setDays] = useState<BoardDay[]>(initialDays);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Guards the add: a second click before the first insert lands would anchor on
  // a row that doesn't exist yet and could mint a second set id for one board.
  const [addingDay, setAddingDay] = useState(false);

  const isSet = days.length > 1;
  const title = useMemo(
    () =>
      isSet
        ? setTitle(days.map((d) => displayTitle(d.project.name, 'story')))
        : displayTitle(days[0]?.project.name ?? '', 'story'),
    [days, isSet],
  );
  // The chip belongs to the day you opened; if that one was just deleted, the
  // board's first day stands in.
  const sourceId = days.some((d) => d.project.id === currentId) ? currentId : days[0]?.project.id;

  const showError = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 3500);
  }, []);

  const flash = useCallback((id: string) => {
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
  }, []);

  const patchDay = useCallback((dayId: string, patch: (day: BoardDay) => BoardDay) => {
    setDays((prev) => prev.map((d) => (d.project.id === dayId ? patch(d) : d)));
  }, []);

  /** Apply fresh set tags (index / size / id) returned by a server action. */
  const applyTags = useCallback((tags: ReadonlyArray<SetTag>) => {
    if (tags.length === 0) return;
    const byId = new Map(tags.map((t) => [t.id, t]));
    setDays((prev) =>
      prev.map((d) => {
        const tag = byId.get(d.project.id);
        return tag ? { ...d, project: { ...d.project, ...tag } } : d;
      }),
    );
  }, []);

  // A day that has never been named takes its name from its opening card. The
  // write happens in the card; this is the header catching up, so the user sees
  // «Нова історія» become what they just wrote instead of finding out on reload.
  useEffect(
    () =>
      onStorytellingAutoNamed(({ id, name }) =>
        setDays((prev) =>
          prev.map((d) => (d.project.id === id ? { ...d, project: { ...d.project, name } } : d)),
        ),
      ),
    [],
  );

  // ── Board-level (day) actions ──

  const handleRenameDay = useCallback(
    (dayId: string, name: string) => {
      patchDay(dayId, (d) => ({ ...d, project: { ...d.project, name } }));
      void updateStorytellingProjectName(dayId, name);
    },
    [patchDay],
  );

  // Optimistic: the column renders instantly under client-generated ids, so the
  // first card can be typed into before the insert resolves. The server picks
  // the date (it knows which days are already booked) and it arrives with the
  // response — the date chip is keyed on it, so it re-renders when it lands.
  const handleAddDay = useCallback(() => {
    if (addingDay) return;
    const anchorId = days[days.length - 1]?.project.id ?? currentId;
    const projectId = genClientId();
    const columnId = genClientId();
    const storyId = genClientId();
    const index = nextSetIndex(days.map((d) => d.project));
    const now = new Date().toISOString();

    const optimistic: BoardDay = {
      project: {
        id: projectId,
        user_id: days[0]?.project.user_id ?? '',
        name: dayName(setTitle(days.map((d) => d.project.name)), index),
        created_at: now,
        updated_at: now,
        set_id: days[0]?.project.set_id ?? null,
        set_index: index,
        set_size: days.length + 1,
        scheduled_date: null,
        status: 'idea',
      },
      columnId,
      stories: [makeOptimisticStory(columnId, 0, storyId)],
    };
    setDays((prev) => [...prev, optimistic]);
    setAddingDay(true);

    void addStorytellingDay(anchorId, { projectId, columnId, storyId })
      .then((res) => {
        if (!res.ok) throw new Error(res.error);
        // The real row carries the proposed date and the settled set tag.
        patchDay(projectId, (d) => ({ ...d, project: res.day.project }));
        applyTags(res.tags);
      })
      .catch(() => {
        setDays((prev) => prev.filter((d) => d.project.id !== projectId));
        showError('Не вдалося додати сторітел. Спробуй ще раз.');
      })
      .finally(() => setAddingDay(false));
  }, [days, currentId, addingDay, patchDay, applyTags, showError]);

  const handleDeleteDay = useCallback(
    (dayId: string) => {
      const victim = days.find((d) => d.project.id === dayId);
      if (!victim || days.length <= 1) return;
      const label = displayTitle(victim.project.name, 'story');
      const written = victim.stories.some((s) => (s.text || '').trim().length > 0);
      if (
        written &&
        !window.confirm(`Видалити «${label}» разом із ${victim.stories.length} сторіс?`)
      ) {
        return;
      }

      const snapshot = days;
      setDays((prev) => prev.filter((d) => d.project.id !== dayId));
      // The URL may point at the day being removed; keep it pointing at something
      // that still exists so a refresh doesn't bounce to the list.
      if (dayId === currentId) {
        const next = snapshot.find((d) => d.project.id !== dayId);
        if (next) router.replace(`/storytelling/${next.project.id}`);
      }

      void removeStorytellingDay(dayId)
        .then((res) => {
          if (!res.ok) throw new Error(res.error);
          applyTags(res.tags);
        })
        .catch(() => {
          setDays(snapshot);
          showError('Не вдалося видалити сторітел.');
        });
    },
    [days, currentId, router, applyTags, showError],
  );

  const handleMoveDay = useCallback(
    (dayId: string, direction: -1 | 1) => {
      const from = days.findIndex((d) => d.project.id === dayId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= days.length) return;

      const next = [...days];
      [next[from], next[to]] = [next[to], next[from]];
      setDays(next);
      void reorderStorytellingDays(next.map((d) => d.project.id)).then((res) => {
        if (res.ok) applyTags(res.tags);
      });
    },
    [days, applyTags],
  );

  // ── Card actions, scoped to their day ──

  const handleAddStory = useCallback(
    (dayId: string) => {
      const day = days.find((d) => d.project.id === dayId);
      if (!day?.columnId) {
        showError('Не вдалося додати сторіс — онови сторінку.');
        return;
      }
      const storyId = genClientId();
      const orderIndex = nextOrderIndex(day.stories);
      patchDay(dayId, (d) => ({
        ...d,
        stories: [...d.stories, makeOptimisticStory(day.columnId as string, orderIndex, storyId)],
      }));

      void createStorytellingStory(day.columnId, orderIndex, storyId)
        .then((story) => {
          if (!story) throw new Error('insert failed');
        })
        .catch(() => {
          patchDay(dayId, (d) => ({ ...d, stories: d.stories.filter((s) => s.id !== storyId) }));
          showError('Не вдалося додати сторіс. Спробуй ще раз.');
        });
    },
    [days, patchDay, showError],
  );

  const handleDeleteStory = useCallback(
    (dayId: string, storyId: string) => {
      patchDay(dayId, (d) => ({ ...d, stories: d.stories.filter((s) => s.id !== storyId) }));
      void deleteStorytellingStory(storyId);
    },
    [patchDay],
  );

  const handleUpdateStory = useCallback(
    (dayId: string, storyId: string, updates: Partial<StorytellingStory>) => {
      patchDay(dayId, (d) => ({
        ...d,
        stories: d.stories.map((s) => (s.id === storyId ? { ...s, ...updates } : s)),
      }));
    },
    [patchDay],
  );

  const handleMoveStory = useCallback(
    (dayId: string, fromIndex: number, toIndex: number) => {
      const day = days.find((d) => d.project.id === dayId);
      if (!day || toIndex < 0 || toIndex >= day.stories.length) return;

      const stories = [...day.stories];
      const [moved] = stories.splice(fromIndex, 1);
      stories.splice(toIndex, 0, moved);
      patchDay(dayId, (d) => ({ ...d, stories }));

      // Legacy cards keep their own column_id, so the new order is persisted per
      // owning column rather than assuming the day has only one.
      const byColumn = new Map<string, string[]>();
      for (const s of stories) {
        const arr = byColumn.get(s.column_id) ?? [];
        arr.push(s.id);
        byColumn.set(s.column_id, arr);
      }
      for (const [col, ids] of byColumn) void reorderStorytellingStories(col, ids);
    },
    [days, patchDay],
  );

  // ── Copy ──

  const copyText = useCallback(
    async (text: string, flashId: string) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(flashId);
      } catch {
        /* clipboard may be denied (non-secure context) */
      }
    },
    [flash],
  );

  const copyDay = useCallback(
    (dayId: string) => {
      const day = days.find((d) => d.project.id === dayId);
      if (day) void copyText(formatDayAsText(day), dayId);
    },
    [days, copyText],
  );

  const copyAll = useCallback(() => {
    const body = days.map(formatDayAsText).join('\n\n———\n\n');
    void copyText(isSet ? `${title}\n\n${body}` : body, 'all');
  }, [days, isSet, title, copyText]);

  /**
   * Rename the whole board. A single story owns its name outright; a set has no
   * row of its own, so the new stem is written into the days that carry the old
   * one (days renamed by hand keep their names — see `renameSetStem`).
   */
  const handleRenameBoard = useCallback(
    (next: string) => {
      if (!isSet) {
        const only = days[0];
        if (only) handleRenameDay(only.project.id, next);
        return;
      }
      const renames = renameSetStem(
        days.map((d) => ({ id: d.project.id, name: displayTitle(d.project.name, 'story') })),
        title,
        next,
      );
      for (const rename of renames) handleRenameDay(rename.id, rename.name);
    },
    [days, isSet, title, handleRenameDay],
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

      {/* Inline padding-bottom beats `.app-page`'s own rule (Tailwind pb-* is
          overridden by the unlayered .app-page class), so the last card's
          «Інтерактив» always clears the fixed bottom bar. */}
      <div
        // The board is capped by the VIEWPORT as well as by 1180px: an intrinsic
        // width wider than the screen would otherwise become the app shell's
        // width and drag every other surface sideways with it.
        // One width for both states: the board needs room for the story column
        // AND the «+» column beside it, so a 640px cap would clip the very
        // affordance that shows you the board exists. Reading width is set by the
        // column itself, not by the page.
        className="mx-auto w-full max-w-[min(1180px,100vw)] px-4 pt-5"
        style={{ paddingBottom: 'calc(104px + env(safe-area-inset-bottom))' }}
      >
        <EditorTopBar
          backHref="/storytellings"
          title={title}
          kind="story"
          onRename={handleRenameBoard}
          meta={sourceId ? <SourceDumpChip contentId={sourceId} /> : null}
          trailing={
            <button
              type="button"
              onClick={copyAll}
              aria-label="Копіювати всі сторіс"
              title={copiedId === 'all' ? 'Скопійовано' : 'Копіювати всі сторіс'}
              className="app-icon-btn"
            >
              {copiedId === 'all' ? (
                <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.4} />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={1.8} />
              )}
            </button>
          }
        />

        <p className="mb-4 mt-1 px-1 text-[12.5px] font-medium text-[color:var(--text-muted)]">
          {isSet
            ? `${boardSummary(days.length, totalStories(days))} · кожна зі своїм днем`
            : `${totalStories(days)} сторіс · одна історія на день`}
        </p>

        {/* The board is ALWAYS a row of columns, even when there is one story.
            It used to collapse to a plain vertical list until a second day
            existed, which meant the multi-story view was invisible until you had
            already guessed it was there. The «+» column at the end is what makes
            it visible: the shape of the board is on screen from the first story. */}
        <div
          data-testid="story-board"
          className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d8 transparent' }}
        >
          {days.map((day, index) => (
            <DayColumn
              key={day.project.id}
              day={day}
              index={index}
              dayCount={days.length}
              copied={copiedId === day.project.id}
              onRename={handleRenameDay}
              onCopy={copyDay}
              onDelete={handleDeleteDay}
              onMove={handleMoveDay}
              onAddStory={handleAddStory}
              onUpdateStory={handleUpdateStory}
              onDeleteStory={handleDeleteStory}
              onMoveStory={handleMoveStory}
            />
          ))}

          {/* Add-a-day lives HERE, among the columns, not in the bottom bar. In
              the bar it sat directly under «Додати сторіс» — two buttons whose
              labels differ by three letters, stacked. One action, one place. */}
          <button
            type="button"
            onClick={handleAddDay}
            disabled={addingDay}
            data-testid="add-column"
            className="flex w-[62vw] shrink-0 snap-start flex-col items-center justify-center gap-2 self-start rounded-[16px] border-2 border-dashed border-[color:var(--border)] bg-[color:var(--surface1)]/60 p-6 text-center transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface1)] disabled:opacity-60 sm:w-[240px]"
            style={{ minHeight: 180 }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-400 shadow-sm">
              <Plus className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <span className="text-sm font-semibold text-zinc-600">Додати сторітел</span>
            <span className="text-[12px] leading-snug text-[color:var(--text-muted)]">
              ще одна історія — свій день і свій статус
            </span>
          </button>
        </div>
      </div>

      {/* Thumb zone: the ONE repeated action, adding a story to the day you are
          writing. On a set each column owns its own «Додати сторіс» (a single
          global one would not know which day it meant), so the bar steps aside. */}
      {!isSet && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--border)] bg-[color:var(--background)]/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur"
          style={{ boxShadow: '0 -2px 20px rgba(0,0,0,0.06)' }}
        >
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <button
              type="button"
              onClick={() => days[0] && handleAddStory(days[0].project.id)}
              data-testid="add-story-primary"
              className="app-btn-primary flex-1"
            >
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              Додати сторіс
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
