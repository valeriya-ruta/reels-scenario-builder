'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePro } from '@/components/pro/ProContext';
import BloggerFormModal from '@/components/pro/BloggerFormModal';
import type { ProProject } from '@/lib/pro/types';
import { setActiveProjectAction } from '@/app/pro/actions';

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

function Avatar({ project }: { project: ProProject }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px]"
      style={{ background: `${project.color}22`, boxShadow: `inset 0 0 0 1.5px ${project.color}` }}
    >
      {project.emoji ?? project.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function ProSwitcher() {
  const { isOperator, projects, activeProject } = usePro();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; project?: ProProject }>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!isOperator) return null;

  function pick(value: string, dest: string) {
    setOpen(false);
    startTransition(async () => {
      await setActiveProjectAction(value);
      // Switching the active blogger changes a server-side (cookie) scope that
      // every RSC reads. A client push+refresh races Next's router cache and can
      // paint the previous blogger's data until a manual reload — so do a hard
      // navigation, which reads the new cookie fresh on the server. (Pro-only.)
      window.location.assign(dest);
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {activeProject ? (
          <>
            <Avatar project={activeProject} />
            <span className="max-w-[140px] truncate">{activeProject.name}</span>
          </>
        ) : (
          <>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[13px] text-white">
              ▦
            </span>
            <span>Всі блогери</span>
          </>
        )}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-zinc-400">
          <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl"
          role="listbox"
        >
          <button
            type="button"
            onClick={() => pick('all', '/pro/dashboard')}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
              !activeProject ? 'font-semibold text-zinc-900' : 'text-zinc-700'
            }`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[13px] text-white">
              ▦
            </span>
            <span className="flex-1">Всі блогери · Дашборд</span>
            {!activeProject && <Check />}
          </button>

          <div className="my-1 border-t border-zinc-100" />
          <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Блогери
          </p>

          {projects.length === 0 && (
            <p className="px-3 py-2 text-sm text-zinc-400">Ще немає блогерів</p>
          )}

          {projects.map((p) => {
            const active = activeProject?.id === p.id;
            return (
              <div key={p.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => pick(p.id, '/')}
                  className={`flex flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                    active ? 'font-semibold text-zinc-900' : 'text-zinc-700'
                  }`}
                >
                  <Avatar project={p} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <Dot color={p.color} />
                  {active && <Check />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setModal({ mode: 'edit', project: p });
                  }}
                  className="mr-1 rounded-md p-1.5 text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-700 group-hover:opacity-100"
                  aria-label="Редагувати"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9l6.5-6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            );
          })}

          {activeProject && (
            <>
              <div className="my-1 border-t border-zinc-100" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push('/pro/share');
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-[13px]">
                  🔗
                </span>
                <span className="flex-1 truncate">Клієнтський лінк</span>
              </button>
            </>
          )}

          <div className="my-1 border-t border-zinc-100" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setModal({ mode: 'create' });
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-zinc-400 text-zinc-500">
              +
            </span>
            Новий блогер
          </button>
        </div>
      )}

      {modal && (
        <BloggerFormModal
          mode={modal.mode}
          project={modal.project}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-zinc-900">
      <path d="M3.5 8l2.5 2.5L11.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
