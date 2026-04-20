'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const POLL_MS = 3000;
const MAX_ATTEMPTS = 8;

type StatusJson = {
  phase?: string | null;
  status?: string | null;
  phaseEndsAt?: string | null;
};

function formatDateDdMmYyyy(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('.');
}

export default function TrialSuccessClient() {
  const router = useRouter();
  const [trialReady, setTrialReady] = useState(false);
  const [phaseEndsLabel, setPhaseEndsLabel] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const attemptsRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      attemptsRef.current += 1;
      if (attemptsRef.current > MAX_ATTEMPTS) return;

      try {
        const res = await fetch('/api/payments/status', { credentials: 'include' });
        const json = (await res.json()) as StatusJson;
        if (res.ok && (json.phase === 'trial' || json.status === 'trialing')) {
          setTrialReady(true);
          setPhaseEndsLabel(formatDateDdMmYyyy(json.phaseEndsAt ?? null));
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }
      } catch {
        // retry until max attempts
      }

      if (attemptsRef.current >= MAX_ATTEMPTS) {
        setTimedOut(true);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    void poll();
    intervalRef.current = setInterval(() => void poll(), POLL_MS);

    return () => {
      stopped = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div className="w-full max-w-[480px] text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900">Картку підтверджено ✓</h1>
      <p className="mt-3 text-base leading-normal text-zinc-700">
        Твій безкоштовний місяць починається зараз <span aria-hidden>🎉</span>
      </p>
      <p className="mt-2 text-sm leading-normal text-zinc-600">
        Ми заблокували 1-5 грн для перевірки та вже повернули їх
      </p>

      <div className="mt-8 min-h-[4.5rem]">
        {trialReady ? (
          <p className="text-base font-medium text-zinc-900">
            Доступ відкрито · безкоштовно до {phaseEndsLabel}
          </p>
        ) : timedOut ? (
          <p className="text-sm leading-normal text-zinc-600">
            Майже готово! Доступ зʼявиться за кілька хвилин.
          </p>
        ) : (
          <p className="inline-flex items-center gap-2 text-sm text-zinc-500">
            <svg className="h-4 w-4 animate-spin text-[color:var(--accent)]" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Перевіряємо статус…
          </p>
        )}
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem('ruta_show_welcome', '1');
            } catch {
              // ignore
            }
            router.push('/dashboard?welcome=1');
          }}
          className="inline-flex items-center justify-center rounded-xl bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-white transition-[background,transform] hover:brightness-110"
        >
          Відкрити Ruta →
        </button>
      </div>
    </div>
  );
}
