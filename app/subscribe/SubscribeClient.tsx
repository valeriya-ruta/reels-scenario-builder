'use client';

import { Check, Lock } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';

type WfpFormState = {
  action: string;
  fields: Record<string, string>;
};

export default function SubscribeClient() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wfpFormRef = useRef<HTMLFormElement>(null);
  const [wfp, setWfp] = useState<WfpFormState | null>(null);

  useEffect(() => {
    if (wfp && wfpFormRef.current) {
      wfpFormRef.current.submit();
    }
  }, [wfp]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/payments/start-trial', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          formParams?: Record<string, string>;
          action?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || `Помилка ${res.status}`);
        }
        if (!data.formParams || !data.action) {
          throw new Error('Некоректна відповідь сервера');
        }
        setWfp({
          action: data.action,
          fields: { ...data.formParams, language: 'UA' },
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Не вдалося підготувати оплату');
      }
    });
  }

  return (
    <div className="w-full max-w-[480px]">
      {wfp && (
        <form ref={wfpFormRef} method="POST" action={wfp.action} className="hidden" aria-hidden>
          {Object.entries(wfp.fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        </form>
      )}

      <div className="mb-8 text-center">
        <p className="font-display text-4xl font-black tracking-tight text-zinc-900 sm:text-5xl">Ruta</p>
        <p className="mt-1 text-sm text-zinc-500">твоя контент-подружка</p>
      </div>

      <h1 className="font-display text-center text-2xl font-bold leading-snug tracking-tight text-zinc-900 sm:text-[1.65rem]">
        Один крок до твого безкоштовного місяця
      </h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-zinc-600 sm:text-[0.9375rem]">
        Вводь картку — перший місяць повністю безкоштовний. Ми заблокуємо 1-5 грн для перевірки та одразу повернемо їх.
      </p>

      <div className="card-shadow relative mt-6 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-gradient-to-br from-[color:var(--accent-soft)] to-white p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(0,75,168,0.08),transparent_55%)]" />
        <p className="relative text-xs font-semibold uppercase tracking-wide text-[color:var(--accent)]">Планувальник рілів</p>
        <div className="relative mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`aspect-[9/16] rounded-lg border border-white/80 bg-white/90 shadow-sm ${
                i === 1 ? 'ring-2 ring-[color:var(--accent)]/40' : ''
              }`}
            />
          ))}
        </div>
        <p className="relative mt-3 text-center text-xs leading-normal text-zinc-600">
          Сценарій, кадри та переходи — в одному місці
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-xs text-zinc-600 sm:text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
          Безпечна оплата
        </span>
        <span className="hidden text-zinc-300 sm:inline">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
          Без списань 30 днів
        </span>
        <span className="hidden text-zinc-300 sm:inline">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
          Скасуй будь-коли
        </span>
      </div>

      <form
        onSubmit={onSubmit}
        className="card-shadow mt-8 space-y-4 rounded-2xl border border-[color:var(--border)] bg-white p-6"
      >
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-3.5 text-sm font-semibold text-white transition-[background,transform] hover:brightness-110 disabled:opacity-60"
        >
          {pending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Зачекай…
            </>
          ) : (
            'Підтвердити картку та отримати доступ'
          )}
        </button>

        <p className="text-center text-xs leading-relaxed text-zinc-500">
          Після 30 днів — $5/міс. Потім $10/міс. Скасування в будь-який момент.
        </p>
      </form>
    </div>
  );
}
