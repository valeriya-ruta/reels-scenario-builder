'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitAccessCode } from '@/app/signup/actions';

const ACCENT = '#6C5CE7';
const WAITLIST_URL = process.env.NEXT_PUBLIC_WAITLIST_URL || 'https://web.ruta.media';

/**
 * Signup access-code gate screen (task 86d3e1egm). Sits in front of the signup
 * form: only focus-group members (who have the code from the group chat) get
 * through. Layout follows the spec — big left-aligned heading, subtext, a clean
 * code input, full-width submit (disabled until entered), and a small waitlist
 * fallback link. Validation happens server-side (submitAccessCode).
 */
export default function AccessCodeGate() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const trimmed = code.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(false);
    try {
      const { ok } = await submitAccessCode(trimmed);
      if (ok) {
        // Grant cookie is set; re-render the page so the signup form shows.
        router.refresh();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="w-full max-w-[420px] rounded-2xl border border-[#e8e3dc] bg-white p-10 shadow-sm"
      style={{ borderRadius: 16, padding: 40 }}
    >
      <div className="mb-8">
        <p className="font-display text-3xl font-black tracking-tight text-[#1a1a1a]">Ruta</p>
      </div>

      <h1 className="mb-2 text-[26px] font-extrabold leading-tight text-[#1a1a1a]">
        Введи код доступу
      </h1>
      <p className="mb-6 text-[15px] leading-[1.6] text-[#555]">
        Код доступу — у чаті фокус-групи. Введи його, щоб створити акаунт.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            id="access-code"
            data-testid="access-code-input"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError(false);
            }}
            placeholder="Код доступу"
            aria-invalid={error}
            className="h-12 w-full rounded-[10px] border px-4 text-center text-[16px] font-semibold tracking-[0.2em] text-[#1a1a1a] outline-none transition-colors placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400"
            style={{ borderColor: error ? '#a1a1aa' : trimmed ? ACCENT : '#e8e3dc' }}
          />
          {error && (
            // Not red: red is reserved for destructive actions in Ruta's system.
            <p data-testid="access-code-error" className="mt-2 text-[13px] font-medium text-[#555]">
              Код не підійшов. Перевір його в чаті фокус-групи.
            </p>
          )}
        </div>

        <button
          type="submit"
          data-testid="access-code-submit"
          disabled={!trimmed || loading}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] text-[15px] font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: ACCENT }}
        >
          {loading ? (
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            'Далі →'
          )}
        </button>
      </form>

      <p className="pt-6 text-[13px] leading-relaxed text-[#888]">
        Не в фокус-групі?{' '}
        <a
          href={WAITLIST_URL}
          className="font-semibold underline decoration-[#c9c3ff] underline-offset-2 hover:decoration-[#6C5CE7]"
          style={{ color: ACCENT }}
        >
          Запишись у список очікування ТУТ
        </a>
      </p>
    </div>
  );
}
