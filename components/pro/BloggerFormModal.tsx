'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_BLOGGER_COLORS, type ProProject } from '@/lib/pro/types';
import { createBloggerAction, updateBloggerAction, deleteBloggerAction } from '@/app/pro/actions';

type Props = {
  mode: 'create' | 'edit';
  project?: ProProject;
  onClose: () => void;
  /** Where to go after a successful create (defaults to Home, now pinned to the new blogger). */
  onCreated?: (project: ProProject) => void;
};

const EMOJI_CHOICES = ['🎬', '💄', '🏋️', '🍳', '✈️', '📸', '🎨', '🐶', '👗', '💅', '🌿', '⚽', '🎸', '📚'];

export default function BloggerFormModal({ mode, project, onClose, onCreated }: Props) {
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? '');
  const [color, setColor] = useState(project?.color ?? DEFAULT_BLOGGER_COLORS[0]);
  const [emoji, setEmoji] = useState<string | null>(project?.emoji ?? EMOJI_CHOICES[0]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) {
      setError('Введи імʼя блогера');
      return;
    }
    setError(null);
    startTransition(async () => {
      if (mode === 'create') {
        const res = await createBloggerAction({ name, color, emoji });
        if (!res.ok) {
          setError('Не вдалося створити блогера');
          return;
        }
        onClose();
        if (onCreated) onCreated(res.project);
        else {
          router.push('/');
          router.refresh();
        }
      } else if (project) {
        const res = await updateBloggerAction(project.id, { name, color, emoji });
        if (!res.ok) {
          setError('Не вдалося зберегти');
          return;
        }
        onClose();
        router.refresh();
      }
    });
  }

  function remove() {
    if (!project) return;
    if (!confirm(`Видалити блогера «${project.name}» разом з усім контентом?`)) return;
    startTransition(async () => {
      await deleteBloggerAction(project.id);
      onClose();
      router.push('/pro/dashboard');
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">
          {mode === 'create' ? 'Новий блогер' : 'Редагувати блогера'}
        </h2>

        <label className="mb-1 block text-sm font-medium text-zinc-600">Імʼя</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Напр. Марія · б'юті"
          className="mb-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500"
        />

        <label className="mb-1 block text-sm font-medium text-zinc-600">Колір</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {DEFAULT_BLOGGER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full border-2 transition ${
                color === c ? 'border-zinc-900 scale-110' : 'border-transparent'
              }`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>

        <label className="mb-1 block text-sm font-medium text-zinc-600">Емодзі</label>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {EMOJI_CHOICES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition ${
                emoji === e ? 'bg-zinc-900 ring-2 ring-zinc-900' : 'bg-zinc-100 hover:bg-zinc-200'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              Видалити
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {pending ? '…' : mode === 'create' ? 'Створити' : 'Зберегти'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
