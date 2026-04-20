'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
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
import type { CarouselProject } from '@/lib/domain';
import { deleteCarouselProject, updateCarouselProjectName } from '@/app/carousel-actions';

interface Props {
  projects: CarouselProject[];
}

function SortableCarouselRow({
  project,
  onStartEdit,
  onStartDelete,
}: {
  project: CarouselProject;
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
        aria-label="Перемістити карусель"
        className="flex cursor-grab items-center px-3 text-zinc-400 hover:text-zinc-600"
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

      <Link href={`/carousel/${project.id}`} className="flex-1 p-5">
        <h2 className="font-display font-medium text-zinc-900">{project.name}</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Оновлено {new Date(project.updated_at).toLocaleDateString('uk-UA')}
        </p>
      </Link>

      <button
        type="button"
        onClick={onStartEdit}
        className="flex cursor-pointer items-center px-2 text-zinc-400 hover:text-zinc-600"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536M4 20h4.5L19 9.5 14.5 5 4 15.5V20z"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={onStartDelete}
        className="flex cursor-pointer items-center px-3 text-zinc-400 hover:text-red-600"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 7h12M10 11v6M14 11v6M9 7l1-2h4l1 2M9 7h6M7 7v11a1 1 0 001 1h8a1 1 0 001-1V7"
          />
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

export default function CarouselProjectsList({ projects }: Props) {
  const [items, setItems] = useState(projects);
  const [projectToDelete, setProjectToDelete] = useState<CarouselProject | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<CarouselProject | null>(null);
  const [editName, setEditName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface)]/60 px-6 py-14 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white card-shadow text-zinc-500">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM3.75 15.75a2.25 2.25 0 012.25-2.25h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25v-2.25z"
            />
          </svg>
        </div>
        <p className="max-w-sm text-sm leading-normal text-zinc-700">
          Тут поки що нічого немає. Створи першу карусель, щоб відкрити студію.
        </p>
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
    await deleteCarouselProject(projectToDelete.id);
    setItems((cur) => cur.filter((p) => p.id !== projectToDelete.id));
    setProjectToDelete(null);
  };

  const saveEdit = async () => {
    if (!projectToEdit) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    await updateCarouselProjectName(projectToEdit.id, trimmed);
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
              <SortableCarouselRow
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

      {projectToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[color:var(--border)] bg-white p-6 shadow-xl">
            <p className="text-sm text-zinc-800">
              Видалити «{projectToDelete.name}»? Цю дію не можна скасувати.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-zinc-800"
                onClick={() => setProjectToDelete(null)}
              >
                Скасувати
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => void confirmDelete()}
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}

      {projectToEdit && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[color:var(--border)] bg-white p-6 shadow-xl">
            <label className="block text-sm font-medium text-zinc-800">Назва</label>
            <input
              className="mt-2 w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveEdit();
              }}
              autoFocus
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-zinc-800"
                onClick={() => {
                  setProjectToEdit(null);
                  setEditName('');
                }}
              >
                Скасувати
              </button>
              <button
                type="button"
                className="rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                onClick={() => void saveEdit()}
              >
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
