'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { StorytellingProject } from '@/lib/domain';
import {
  deleteStorytellingProject,
  updateStorytellingProjectName,
} from '@/app/storytelling-actions';

interface Props {
  projects: StorytellingProject[];
}

function SortableStorytellingRow({
  project,
  onStartEdit,
  onStartDelete,
}: {
  project: StorytellingProject;
  onStartEdit: () => void;
  onStartDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-stretch rounded-lg border border-[color:var(--border)] bg-white card-shadow transition-colors hover:border-zinc-300 hover:bg-zinc-50"
    >
      <button
        type="button"
        aria-label="Перемістити сторітелінг"
        className="flex items-center px-3 text-zinc-400 hover:text-zinc-600 cursor-grab"
        {...attributes}
        {...listeners}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 20 20">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 4h.01M13 4h.01M7 10h.01M13 10h.01M7 16h.01M13 16h.01"
          />
        </svg>
      </button>

      <Link href={`/storytelling/${project.id}`} className="flex-1 p-5">
        <h2 className="font-display font-medium text-zinc-900">{project.name}</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Оновлено {new Date(project.updated_at).toLocaleDateString('uk-UA')}
        </p>
      </Link>

      <button
        type="button"
        onClick={onStartEdit}
        className="flex items-center px-2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M4 20h4.5L19 9.5 14.5 5 4 15.5V20z" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onStartDelete}
        className="flex items-center px-3 text-zinc-400 hover:text-red-600 cursor-pointer"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12M10 11v6M14 11v6M9 7l1-2h4l1 2M9 7h6M7 7v11a1 1 0 001 1h8a1 1 0 001-1V7" />
        </svg>
      </button>

      <div className="flex items-center pr-3 text-zinc-400 group-hover:text-zinc-500">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

export default function StorytellingProjectsList({ projects }: Props) {
  const [items, setItems] = useState(projects);
  const [projectToDelete, setProjectToDelete] = useState<StorytellingProject | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<StorytellingProject | null>(null);
  const [editName, setEditName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface)]/60 px-6 py-14 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white card-shadow text-zinc-500">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006.75 7.5v8.25m0 0A8.967 8.967 0 0012 17.25a8.967 8.967 0 006.75-2.292M15 12h3m-3 0v3m0-3h3m-3 0h-3" />
          </svg>
        </div>
        <p className="max-w-sm text-sm leading-normal text-zinc-700">Тут поки що нічого немає. Створи перший сторітелінг, щоб почати.</p>
      </div>
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((p) => p.id === active.id);
    const newIndex = items.findIndex((p) => p.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      setItems((current) => arrayMove(current, oldIndex, newIndex));
    }
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    await deleteStorytellingProject(projectToDelete.id);
    setItems((cur) => cur.filter((p) => p.id !== projectToDelete.id));
    setProjectToDelete(null);
  };

  const saveEdit = async () => {
    if (!projectToEdit) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    await updateStorytellingProjectName(projectToEdit.id, trimmed);
    setItems((cur) =>
      cur.map((p) => (p.id === projectToEdit.id ? { ...p, name: trimmed } : p)),
    );
    setProjectToEdit(null);
    setEditName('');
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {items.map((project) => (
              <SortableStorytellingRow
                key={project.id}
                project={project}
                onStartEdit={() => {
                  setProjectToEdit(project);
                  setEditName(project.name);
                }}
                onStartDelete={() => setProjectToDelete(project)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {projectToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card-shadow w-full max-w-sm rounded-xl border border-[color:var(--border)] bg-white p-6 shadow-lg">
            <h2 className="font-display mb-2 text-lg font-semibold text-zinc-900">Перейменувати</h2>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium leading-normal text-zinc-700">Назва</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm leading-normal text-zinc-900 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/25"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setProjectToEdit(null);
                  setEditName('');
                }}
                className="cursor-pointer rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-[color:var(--surface)]"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="btn-primary cursor-pointer rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
              >
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}

      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card-shadow w-full max-w-sm rounded-xl border border-[color:var(--border)] bg-white p-6 shadow-lg">
            <h2 className="font-display mb-2 text-lg font-semibold text-zinc-900">Видалити сторітелінг?</h2>
            <p className="mb-4 text-sm leading-normal text-zinc-600">
              Ви впевнені, що хочете видалити «{projectToDelete.name}»? Цю дію не можна скасувати.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="cursor-pointer rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-[color:var(--surface)]"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
