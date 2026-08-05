'use client';

import { useMemo, useState } from 'react';
import type { ProProject } from '@/lib/pro/types';
import type { DashboardPiece } from '@/lib/pro/dashboard';
import {
  monthGrid,
  monthLabel,
  shiftMonth,
  dateKey,
  WEEKDAY_LABELS,
} from '@/lib/content/calendar';
import { setActiveProjectAction } from '@/app/pro/actions';
import BloggerFormModal from '@/components/pro/BloggerFormModal';

const TYPE_META: Record<string, { icon: string; label: string }> = {
  reel: { icon: '🎬', label: 'Рілс' },
  reels: { icon: '🎬', label: 'Рілс' },
  carousel: { icon: '🖼️', label: 'Карусель' },
  story: { icon: '📖', label: 'Сторітелінг' },
  idea: { icon: '💡', label: 'Ідея' },
};

function todayKey(): string {
  const d = new Date();
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function ProDashboard({
  projects,
  pieces,
}: {
  projects: ProProject[];
  pieces: DashboardPiece[];
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [active, setActive] = useState<Set<string>>(new Set(projects.map((p) => p.id)));
  const [modal, setModal] = useState(false);

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const scheduledByDay = useMemo(() => {
    const map = new Map<string, DashboardPiece[]>();
    for (const p of pieces) {
      if (!p.scheduledDate) continue;
      if (!active.has(p.projectId)) continue;
      const key = p.scheduledDate.slice(0, 10);
      const arr = map.get(key);
      if (arr) arr.push(p);
      else map.set(key, [p]);
    }
    return map;
  }, [pieces, active]);

  const grid = useMemo(() => monthGrid(year, month0, todayKey()), [year, month0]);

  const perBlogger = useMemo(() => {
    return projects.map((p) => {
      const own = pieces.filter((x) => x.projectId === p.id);
      return {
        project: p,
        total: own.length,
        scheduled: own.filter((x) => x.scheduledDate).length,
        published: own.filter((x) => x.status === 'published').length,
      };
    });
  }, [projects, pieces]);

  function toggle(id: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allOn = active.size === projects.length;

  async function openBlogger(id: string) {
    await setActiveProjectAction(id);
    // Hard nav so the new active-project cookie is read fresh server-side
    // (a client push+refresh can paint stale scope until a manual reload).
    window.location.assign('/');
  }

  function move(delta: number) {
    const { year: y, month0: m } = shiftMonth(year, month0, delta);
    setYear(y);
    setMonth0(m);
  }

  const scheduledCount = pieces.filter((p) => p.scheduledDate).length;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Дашборд</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {projects.length} блогер{plural(projects.length)} · {pieces.length} матеріал
            {pluralMat(pieces.length)} · {scheduledCount} у календарі
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal(true)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
        >
          + Новий блогер
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/50 p-12 text-center">
          <p className="text-lg font-medium text-zinc-700">Ще немає жодного блогера</p>
          <p className="mt-1 text-sm text-zinc-500">
            Створи першого блогера, щоб почати вести його контент.
          </p>
          <button
            type="button"
            onClick={() => setModal(true)}
            className="mt-4 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-black"
          >
            + Створити блогера
          </button>
        </div>
      ) : (
        <>
          {/* Per-blogger overview cards */}
          <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {perBlogger.map(({ project, total, scheduled, published }) => (
              <button
                key={project.id}
                type="button"
                onClick={() => openBlogger(project.id)}
                className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md"
                style={{ borderTopColor: project.color, borderTopWidth: 3 }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-base"
                    style={{ background: `${project.color}22`, boxShadow: `inset 0 0 0 1.5px ${project.color}` }}
                  >
                    {project.emoji ?? project.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-zinc-900">
                    {project.name}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-3 text-sm">
                  <span className="text-zinc-900">
                    <b className="text-lg">{total}</b> всього
                  </span>
                  <span className="text-zinc-500">{scheduled} заплан.</span>
                  <span className="text-zinc-500">{published} опубл.</span>
                </div>
                <span className="mt-2 text-xs font-medium text-zinc-400 group-hover:text-zinc-600">
                  Відкрити →
                </span>
              </button>
            ))}
          </div>

          {/* Filter-by-blogger */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Фільтр
            </span>
            <button
              type="button"
              onClick={() => setActive(new Set(projects.map((p) => p.id)))}
              className={`rounded-full px-3 py-1 text-sm transition ${
                allOn ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Всі
            </button>
            {projects.map((p) => {
              const on = active.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition ${
                    on ? 'text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                  style={on ? { background: p.color } : undefined}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: on ? '#fff' : p.color }}
                  />
                  {p.name}
                </button>
              );
            })}
          </div>

          {/* Merged calendar */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">{monthLabel(year, month0)}</h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(-1)}
                  className="rounded-lg px-2.5 py-1.5 text-zinc-500 hover:bg-zinc-100"
                  aria-label="Попередній місяць"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setYear(now.getFullYear());
                    setMonth0(now.getMonth());
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  Сьогодні
                </button>
                <button
                  type="button"
                  onClick={() => move(1)}
                  className="rounded-lg px-2.5 py-1.5 text-zinc-500 hover:bg-zinc-100"
                  aria-label="Наступний місяць"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px border-b border-zinc-100 pb-1 text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px bg-zinc-100">
              {grid.map((cell) => {
                const items = scheduledByDay.get(cell.key) ?? [];
                return (
                  <div
                    key={cell.key}
                    className={`min-h-[104px] bg-white p-1.5 ${
                      cell.inMonth ? '' : 'bg-zinc-50/60'
                    }`}
                  >
                    <div
                      className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        cell.isToday
                          ? 'bg-zinc-900 font-semibold text-white'
                          : cell.inMonth
                            ? 'text-zinc-600'
                            : 'text-zinc-300'
                      }`}
                    >
                      {cell.day}
                    </div>
                    <div className="flex flex-col gap-1">
                      {items.slice(0, 4).map((it) => {
                        const proj = byId.get(it.projectId);
                        const color = proj?.color ?? '#71717a';
                        const meta = TYPE_META[it.type] ?? { icon: '•', label: '' };
                        return (
                          <button
                            key={it.id}
                            type="button"
                            title={`${proj?.name ?? ''} · ${it.title}`}
                            onClick={() => openBlogger(it.projectId)}
                            className="flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight"
                            style={{ background: `${color}1a`, color: '#27272a' }}
                          >
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: color }}
                            />
                            <span className="shrink-0">{meta.icon}</span>
                            <span className="truncate font-medium" style={{ color }}>
                              {proj?.name ?? '—'}
                            </span>
                            <span className="truncate text-zinc-500">· {it.title}</span>
                          </button>
                        );
                      })}
                      {items.length > 4 && (
                        <span className="px-1 text-[10px] text-zinc-400">+{items.length - 4} ще</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {modal && <BloggerFormModal mode="create" onClose={() => setModal(false)} />}
    </div>
  );
}

function plural(n: number): string {
  return n === 1 ? '' : 'ів';
}
function pluralMat(n: number): string {
  return n === 1 ? '' : 'ів';
}
