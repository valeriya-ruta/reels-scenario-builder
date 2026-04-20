'use client';

import { Check, Lock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';

type WfpFormState = {
  action: string;
  fields: Record<string, string>;
};

export default function SubscribeClient() {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const wfpFormRef = useRef<HTMLFormElement>(null);
  const [wfp, setWfp] = useState<WfpFormState | null>(null);
  const autoStartedRef = useRef(false);

  const requestWayForPayForm = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || autoStartedRef.current) return;
    if (sessionStorage.getItem('ruta_post_signup_verify') !== '1') return;
    autoStartedRef.current = true;
    sessionStorage.removeItem('ruta_post_signup_verify');
    requestWayForPayForm();
  }, [requestWayForPayForm]);

  useEffect(() => {
    if (wfp && wfpFormRef.current) {
      wfpFormRef.current.submit();
    }
  }, [wfp]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    requestWayForPayForm();
  }

  async function onSignOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
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
        Майже готово — додай картку. Списань не буде: лише тимчасовий холд 1 ₴ для перевірки (повертається одразу).
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
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

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-xs text-zinc-600 sm:text-sm">
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

        <p className="text-center text-xs leading-relaxed text-zinc-500">
          Після 30 днів — $5/міс назавжди для першої хвилі. Скасування в будь-який момент.
        </p>

        <p className="text-center">
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="text-sm font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
          >
            Вийти з акаунту
          </button>
        </p>
      </form>
    </div>
  );
}
