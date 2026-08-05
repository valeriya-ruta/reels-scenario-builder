'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ShareIdea, ShareDecision } from '@/lib/pro/share';
import {
  ensureShareLinkAction,
  regenerateShareLinkAction,
  revokeShareLinkAction,
} from '@/app/pro/actions';

export default function ProShareManager({
  projectId,
  projectName,
  projectColor,
  initialToken,
  ideas,
  decisions,
}: {
  projectId: string;
  projectName: string;
  projectColor: string;
  initialToken: string | null;
  ideas: ShareIdea[];
  decisions: Record<string, ShareDecision>;
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(initialToken);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const url = token && typeof window !== 'undefined'
    ? `${window.location.origin}/share/client/${token}`
    : '';

  const approved = Object.values(decisions).filter((d) => d === 'approved').length;
  const rejected = Object.values(decisions).filter((d) => d === 'rejected').length;

  function create() {
    startTransition(async () => {
      const res = await ensureShareLinkAction(projectId);
      if (res.ok) setToken(res.token);
      router.refresh();
    });
  }
  function regenerate() {
    if (!confirm('Оновити токен? Старий лінк перестане працювати.')) return;
    startTransition(async () => {
      const res = await regenerateShareLinkAction(projectId);
      if (res.ok) setToken(res.token);
      setCopied(false);
      router.refresh();
    });
  }
  function revoke() {
    if (!confirm('Вимкнути лінк? Клієнт більше не зможе його відкрити.')) return;
    startTransition(async () => {
      await revokeShareLinkAction(projectId);
      setToken(null);
      router.refresh();
    });
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="h-3 w-3 rounded-full" style={{ background: projectColor }} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Клієнтський лінк</h1>
          <p className="text-sm text-zinc-500">
            {projectName} · клієнт погоджує ідеї свайпом, без входу
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        {!token ? (
          <div className="text-center">
            <p className="text-zinc-600">
              Створи лінк, щоб клієнт зміг переглянути й погодити {ideas.length} підготовлених
              ідей.
            </p>
            <button
              type="button"
              onClick={create}
              disabled={pending}
              className="mt-4 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {pending ? '…' : 'Створити лінк для клієнта'}
            </button>
          </div>
        ) : (
          <>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Посилання (тільки погодження)
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={copy}
                className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
              >
                {copied ? '✓ Скопійовано' : 'Копіювати'}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={regenerate}
                disabled={pending}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Оновити токен
              </button>
              <button
                type="button"
                onClick={revoke}
                disabled={pending}
                className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                Вимкнути лінк
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              Оновлення токена миттєво робить старий лінк недійсним.
            </p>
          </>
        )}
      </div>

      {/* Approvals coming back from the client */}
      {token && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Рішення клієнта</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
                ✓ {approved}
              </span>
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 font-medium text-rose-700">
                ✕ {rejected}
              </span>
            </div>
          </div>
          {ideas.length === 0 ? (
            <p className="text-sm text-zinc-500">
              У цього блогера ще немає ідей. Додай ідеї (брейндамп), потім онови токен, щоб вони
              потрапили в лінк.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {ideas.map((idea) => {
                const d = decisions[idea.id];
                return (
                  <li key={idea.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-800">
                        {idea.title || idea.content.slice(0, 60) || 'Ідея'}
                      </span>
                    </span>
                    {d === 'approved' ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        Погоджено
                      </span>
                    ) : d === 'rejected' ? (
                      <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                        Відхилено
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
                        Очікує
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
