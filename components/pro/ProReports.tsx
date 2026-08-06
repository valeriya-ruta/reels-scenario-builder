'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BugReport, BugStatus } from '@/lib/pro/reports';
import { setBugReportStatusAction } from '@/app/pro/actions';

const STATUS_META: Record<BugStatus, { label: string; cls: string }> = {
  new: { label: 'Новий', cls: 'bg-amber-50 text-amber-700' },
  fixed: { label: 'Виправлено', cls: 'bg-emerald-50 text-emerald-700' },
  wontfix: { label: 'Не буду', cls: 'bg-zinc-100 text-zinc-500' },
};

function fmt(iso: string): string {
  // Deterministic-ish short date; locale formatting is fine on the client.
  const d = new Date(iso);
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

export default function ProReports({ reports }: { reports: BugReport[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | BugStatus>('all');
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c = { new: 0, fixed: 0, wontfix: 0 };
    for (const r of reports) c[r.status] += 1;
    return c;
  }, [reports]);

  const shown = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  function set(id: string, status: BugStatus) {
    startTransition(async () => {
      await setBugReportStatusAction(id, status);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Звіти про баги</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {reports.length} усього · <b className="text-amber-700">{counts.new}</b> нових ·{' '}
          <b className="text-emerald-700">{counts.fixed}</b> виправлено
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ['all', `Всі (${reports.length})`],
          ['new', `Нові (${counts.new})`],
          ['fixed', `Виправлені (${counts.fixed})`],
          ['wontfix', `Не буду (${counts.wontfix})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              filter === key ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/50 p-10 text-center text-sm text-zinc-500">
          Поки що порожньо. Клацни правою кнопкою будь-де → «🐛 Повідомити про баг».
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((r) => {
            const meta = STATUS_META[r.status];
            return (
              <li key={r.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">{fmt(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-[15px] text-zinc-900">{r.comment}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                  {r.route && <span>📍 {r.route}</span>}
                  {r.bloggerName && r.bloggerName !== '—' && <span>👤 {r.bloggerName}</span>}
                  {r.viewport && <span>🖥 {r.viewport}</span>}
                  {r.element && <span className="truncate" title={r.element}>🔎 {r.element}</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  {r.status !== 'fixed' && (
                    <button
                      type="button"
                      onClick={() => set(r.id, 'fixed')}
                      disabled={pending}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      ✓ Виправлено
                    </button>
                  )}
                  {r.status === 'fixed' && (
                    <button
                      type="button"
                      onClick={() => set(r.id, 'new')}
                      disabled={pending}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Відкрити знову
                    </button>
                  )}
                  {r.status !== 'wontfix' && (
                    <button
                      type="button"
                      onClick={() => set(r.id, 'wontfix')}
                      disabled={pending}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      Не буду
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
