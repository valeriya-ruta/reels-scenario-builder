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
import { Project } from '@/lib/domain';
import { deleteProject, updateProjectName } from '@/app/actions';

interface ProjectsListProps {
  projects: Project[];
  linkPrefix?: string;
}

function SortableProjectRow({
  project,
  linkPrefix,
  onStartEdit,
  onStartDelete,
}: {
  project: Project;
  linkPrefix: string;
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
      className="group flex items-stretch rounded-lg border border-zinc-200 bg-white shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50"
    >
      <button
        type="button"
        aria-label="Перемістити проєкт"
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

      <Link href={`${linkPrefix}/${project.id}`} className="flex-1 p-4">
        <div>
          <h2 className="font-medium text-zinc-900">{project.name}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Оновлено {new Date(project.updated_at).toLocaleDateString('uk-UA')}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={onStartEdit}
        className="flex items-center px-2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
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
        className="flex items-center px-3 text-zinc-400 hover:text-red-600 cursor-pointer"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 7h12M10 11v6M14 11v6M9 7l1-2h4l1 2M9 7h6M7 7v11a1 1 0 001 1h8a1 1 0 001-1V7"
          />
        </svg>
      </button>

      <div className="flex items-center pr-3 text-zinc-400 group-hover:text-zinc-500">
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </div>
  );
}

export default function ProjectsList({ projects, linkPrefix = '/project' }: ProjectsListProps) {
  const [items, setItems] = useState(projects);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center text-zinc-600">
        <p>Поки що немає проєктів. Створіть свій перший проєкт, щоб почати.</p>
      </div>
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((p) => p.id === active.id);
    const newIndex = items.findIndex((p) => p.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      setItems((current) => arrayMove(current, oldIndex, newIndex));
    }
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;

    await deleteProject(projectToDelete.id);
    setItems((current) => current.filter((p) => p.id !== projectToDelete.id));
    setProjectToDelete(null);
  };

  const saveEdit = async () => {
    if (!projectToEdit) return;

    const trimmed = editName.trim();
    if (!trimmed) return;

    await updateProjectName(projectToEdit.id, trimmed);
    setItems((current) =>
      current.map((p) =>
        p.id === projectToEdit.id ? { ...p, name: trimmed } : p
      )
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
              <SortableProjectRow
                key={project.id}
                project={project}
                linkPrefix={linkPrefix}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">Перейменувати проєкт</h2>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Назва
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
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
                className="cursor-pointer rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="cursor-pointer rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}

      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">Видалити проєкт?</h2>
            <p className="mb-4 text-sm text-zinc-600">
              Ви впевнені, що хочете видалити «{projectToDelete.name}»? Цю дію не можна скасувати.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="cursor-pointer rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="cursor-pointer rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
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
