'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import type {
  StorytellingProject,
  StorytellingColumn,
  StorytellingStory,
} from '@/lib/domain';
import {
  updateStorytellingProjectName,
  createStorytellingColumn,
  updateStorytellingColumnName,
  deleteStorytellingColumn,
  reorderStorytellingColumns,
  createStorytellingStory,
  deleteStorytellingStory,
  reorderStorytellingStories,
} from '@/app/storytelling-actions';
import StoryCard from './StoryCard';

interface Props {
  project: StorytellingProject;
  initialColumns: StorytellingColumn[];
  initialStories: StorytellingStory[];
}

type ColumnWithStories = StorytellingColumn & { stories: StorytellingStory[] };

function buildColumnsWithStories(
  columns: StorytellingColumn[],
  stories: StorytellingStory[],
): ColumnWithStories[] {
  const storyMap = new Map<string, StorytellingStory[]>();
  for (const s of stories) {
    const arr = storyMap.get(s.column_id) || [];
    arr.push(s);
    storyMap.set(s.column_id, arr);
  }
  return columns
    .sort((a, b) => a.order_index - b.order_index)
    .map((col) => ({
      ...col,
      stories: (storyMap.get(col.id) || []).sort((a, b) => a.order_index - b.order_index),
    }));
}

export default function StorytellingBuilder({ project: initialProject, initialColumns, initialStories }: Props) {
  const [project, setProject] = useState(initialProject);
  const [columns, setColumns] = useState<ColumnWithStories[]>(() =>
    buildColumnsWithStories(initialColumns, initialStories),
  );
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [colNameValue, setColNameValue] = useState('');

  // ── Project name ──

  const handleNameSave = useCallback(async () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== project.name) {
      setProject((p) => ({ ...p, name: trimmed }));
      await updateStorytellingProjectName(project.id, trimmed);
    } else {
      setNameValue(project.name);
    }
  }, [nameValue, project]);

  // ── Column operations ──

  const handleAddColumn = async () => {
    const result = await createStorytellingColumn(
      project.id,
      `Storytelling ${columns.length + 1}`,
      columns.length,
    );
    if (result) {
      setColumns((prev) => [
        ...prev,
        { ...result.column, stories: [result.story] },
      ]);
    }
  };

  const handleDeleteColumn = async (colId: string) => {
    if (columns.length <= 1) return;
    setColumns((prev) => prev.filter((c) => c.id !== colId));
    await deleteStorytellingColumn(colId);
  };

  const handleColumnNameSave = async (colId: string) => {
    setEditingColId(null);
    const trimmed = colNameValue.trim();
    if (!trimmed) return;
    setColumns((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, name: trimmed } : c)),
    );
    await updateStorytellingColumnName(colId, trimmed);
  };

  const moveColumn = async (colId: string, direction: 'left' | 'right') => {
    const idx = columns.findIndex((c) => c.id === colId);
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= columns.length) return;

    const newCols = [...columns];
    [newCols[idx], newCols[targetIdx]] = [newCols[targetIdx], newCols[idx]];
    setColumns(newCols);
    await reorderStorytellingColumns(
      project.id,
      newCols.map((c) => c.id),
    );
  };

  // ── Story operations ──

  const handleAddStory = async (colId: string) => {
    const col = columns.find((c) => c.id === colId);
    if (!col) return;
    const story = await createStorytellingStory(colId, col.stories.length);
    if (story) {
      setColumns((prev) =>
        prev.map((c) =>
          c.id === colId ? { ...c, stories: [...c.stories, story] } : c,
        ),
      );
    }
  };

  const handleDeleteStory = async (colId: string, storyId: string) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== colId) return c;
        const filtered = c.stories.filter((s) => s.id !== storyId);
        return { ...c, stories: filtered };
      }),
    );
    await deleteStorytellingStory(storyId);
  };

  const handleUpdateStory = (colId: string, storyId: string, updates: Partial<StorytellingStory>) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.id !== colId) return c;
        return {
          ...c,
          stories: c.stories.map((s) =>
            s.id === storyId ? { ...s, ...updates } : s,
          ),
        };
      }),
    );
  };

  const moveStory = async (colId: string, fromIndex: number, toIndex: number) => {
    const col = columns.find((c) => c.id === colId);
    if (!col || toIndex < 0 || toIndex >= col.stories.length) return;

    const newStories = [...col.stories];
    const [moved] = newStories.splice(fromIndex, 1);
    newStories.splice(toIndex, 0, moved);

    setColumns((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, stories: newStories } : c)),
    );
    await reorderStorytellingStories(
      colId,
      newStories.map((s) => s.id),
    );
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mx-auto max-w-[calc(100vw-2rem)] px-4 py-6">
        <div className="mb-3">
          <Link
            href="/storytellings"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>До всіх сторітелінгів</span>
          </Link>
        </div>

        <div className="mb-6 flex items-center gap-4">
          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave();
                if (e.key === 'Escape') { setNameValue(project.name); setEditingName(false); }
              }}
              className="w-full max-w-md rounded border border-zinc-300 bg-white px-3 py-2 text-lg font-semibold text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          ) : (
            <h1
              onClick={() => setEditingName(true)}
              className="cursor-pointer text-2xl font-semibold text-zinc-900 hover:text-zinc-700"
              title={project.name}
            >
              {project.name}
            </h1>
          )}
        </div>
      </div>

      {/* Columns */}
      <div className="flex gap-6 overflow-x-auto px-4 pb-12" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d8 transparent' }}>
        {columns.map((col, colIndex) => (
          <div key={col.id} className="w-80 shrink-0 md:w-[min(380px,calc(33.333vw-32px))]">
            {/* Column header */}
            <div className="mb-4 px-1">
              <div className="group flex items-center justify-between gap-2">
                {editingColId === col.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      autoFocus
                      value={colNameValue}
                      onChange={(e) => setColNameValue(e.target.value)}
                      onBlur={() => handleColumnNameSave(col.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleColumnNameSave(col.id);
                        if (e.key === 'Escape') setEditingColId(null);
                      }}
                      className="flex-1 border-b-2 border-zinc-300 bg-transparent px-1 py-0.5 text-sm font-semibold text-zinc-900 focus:border-zinc-900 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col gap-1">
                    {columns.length > 1 && (
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => moveColumn(col.id, 'left')}
                          disabled={colIndex === 0}
                          className="cursor-pointer p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveColumn(col.id, 'right')}
                          disabled={colIndex === columns.length - 1}
                          className="cursor-pointer p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-zinc-900">{col.name}</h2>
                      <button
                        type="button"
                        onClick={() => { setEditingColId(col.id); setColNameValue(col.name); }}
                        className="cursor-pointer text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100"
                        title="Редагувати назву"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  {columns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteColumn(col.id)}
                      className="cursor-pointer p-1.5 text-zinc-400 transition-colors hover:text-red-500"
                      title="Видалити колонку"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{col.stories.length} сторіс</p>
            </div>

            {/* Stories */}
            <div className="flex flex-col gap-4">
              {col.stories.map((story, storyIndex) => (
                <div key={story.id} className="group/wrapper relative">
                  <div className="absolute -left-5 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 opacity-0 transition-opacity group-hover/wrapper:opacity-100">
                    {storyIndex > 0 && (
                      <button
                        type="button"
                        onClick={() => moveStory(col.id, storyIndex, storyIndex - 1)}
                        className="cursor-pointer rounded-full border border-zinc-200 bg-white p-1 shadow-sm transition-colors hover:bg-zinc-50"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    )}
                    {storyIndex < col.stories.length - 1 && (
                      <button
                        type="button"
                        onClick={() => moveStory(col.id, storyIndex, storyIndex + 1)}
                        className="cursor-pointer rounded-full border border-zinc-200 bg-white p-1 shadow-sm transition-colors hover:bg-zinc-50"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    )}
                  </div>
                  <StoryCard
                    story={story}
                    index={storyIndex}
                    onUpdate={(storyId, updates) => handleUpdateStory(col.id, storyId, updates)}
                    onDelete={(storyId) => handleDeleteStory(col.id, storyId)}
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={() => handleAddStory(col.id)}
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 p-6 transition-colors hover:border-zinc-300 hover:bg-zinc-100/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-400 shadow-sm">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" strokeWidth={2} strokeLinecap="round" /><line x1="5" y1="12" x2="19" y2="12" strokeWidth={2} strokeLinecap="round" /></svg>
                </div>
                <span className="text-sm font-medium text-zinc-500">Додати сторіс</span>
              </button>
            </div>
          </div>
        ))}

        {/* Add column button */}
        <div className="w-80 shrink-0 md:w-[min(380px,calc(33.333vw-32px))]">
          <div className="px-1">
            <button
              type="button"
              onClick={handleAddColumn}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" strokeWidth={2} strokeLinecap="round" /><line x1="5" y1="12" x2="19" y2="12" strokeWidth={2} strokeLinecap="round" /></svg>
              <span>Додати сторітел</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
