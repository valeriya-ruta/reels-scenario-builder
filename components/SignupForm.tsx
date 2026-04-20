'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { localizeAuthError } from '@/lib/authErrorMessages';
import { useRouter } from 'next/navigation';

export default function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'form' | 'interstitial'>('form');
  const router = useRouter();
  const supabase = createClient();
  const interstitialTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (step !== 'interstitial') return;
    interstitialTimerRef.current = window.setTimeout(() => {
      continueToCardRef();
    }, 2000);
    return () => {
      if (interstitialTimerRef.current) window.clearTimeout(interstitialTimerRef.current);
    };
  }, [step]);

  function continueToCardRef() {
    if (interstitialTimerRef.current) {
      window.clearTimeout(interstitialTimerRef.current);
      interstitialTimerRef.current = null;
    }
    try {
      sessionStorage.setItem('ruta_post_signup_verify', '1');
    } catch {
      // ignore
    }
    router.push('/subscribe');
    router.refresh();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) throw signUpError;
      setStep('interstitial');
    } catch (err: unknown) {
      const msg = localizeAuthError(err);
      setError(msg);
      const lower = msg.toLowerCase();
      if (lower.includes('пошт') || lower.includes('email') || lower.includes('already')) {
        setFieldErrors({ email: msg });
      } else if (lower.includes('парол') || lower.includes('password')) {
        setFieldErrors({ password: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  const continueToCard = () => continueToCardRef();

  if (step === 'interstitial') {
    return (
      <div
        className="w-full max-w-[420px] rounded-2xl border border-[#e8e3dc] bg-white p-10 shadow-sm"
        style={{ borderRadius: 16, padding: 40 }}
      >
        <h2 className="text-[22px] font-extrabold leading-tight text-[#1a1a1a]">Акаунт створено ✓</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-[#555]">
          Останній крок — верифікація картки.
          <br />
          Списань не буде — лише перевірка.
        </p>
        <button
          type="button"
          onClick={continueToCard}
          className="mt-8 flex h-12 w-full items-center justify-center rounded-[10px] bg-[#1a1a1a] text-[15px] font-bold text-white transition-opacity hover:opacity-90"
        >
          Продовжити →
        </button>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-[420px] rounded-2xl border border-[#e8e3dc] bg-white p-10 shadow-sm"
      style={{ borderRadius: 16, padding: 40 }}
    >
      <div className="mb-8 text-center">
        <p className="font-display text-4xl font-black tracking-tight text-[#1a1a1a]">Ruta</p>
      </div>

      <h1 className="mb-2 text-[22px] font-extrabold text-[#1a1a1a]">Приєднуйся до першої хвилі</h1>
      <p className="mb-6 text-[15px] leading-[1.6] text-[#555]">
        Перший місяць — безкоштовно.
        <br />
        Потім $5/місяць назавжди. 🔒
        <br />
        Ціна не зросте ніколи.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && !fieldErrors.email && !fieldErrors.password && (
          <div className="rounded-lg border border-[#e05c40]/30 bg-red-50 px-3 py-2 text-[13px] text-[#c03d26]">
            {error}
          </div>
        )}

        <div>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="Електронна пошта"
            aria-invalid={!!fieldErrors.email}
            className={`h-12 w-full rounded-[10px] border px-4 text-[15px] text-[#1a1a1a] outline-none transition-colors placeholder:text-zinc-400 focus:border-[#1a1a1a] ${
              fieldErrors.email ? 'border-[#e05c40]' : 'border-[#e8e3dc]'
            }`}
          />
          {fieldErrors.email && <p className="mt-1 text-[13px] text-[#e05c40]">{fieldErrors.email}</p>}
        </div>

        <div>
          <div className="relative">
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Пароль"
              aria-invalid={!!fieldErrors.password}
              className={`h-12 w-full rounded-[10px] border py-0 pl-4 pr-12 text-[15px] text-[#1a1a1a] outline-none transition-colors placeholder:text-zinc-400 focus:border-[#1a1a1a] ${
                fieldErrors.password ? 'border-[#e05c40]' : 'border-[#e8e3dc]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-800"
              aria-label={showPassword ? 'Приховати пароль' : 'Показати пароль'}
            >
              {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="mt-1 text-[13px] text-[#e05c40]">{fieldErrors.password}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#1a1a1a] text-[15px] font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Завантаження…
            </>
          ) : (
            'Почати безкоштовно →'
          )}
        </button>

        <p className="pt-2 text-center text-[13px] leading-relaxed text-[#555]">
          Вводячи картку, ти не будеш списана одразу.
        </p>

        <p
          className="pt-4 text-center text-[12px] leading-relaxed text-[#aaa]"
          style={{ fontSize: 12, color: '#aaa' }}
        >
          🔒 Без списань зараз · ✓ Скасування будь-коли · 🇺🇦 Підтримка українською
        </p>
      </form>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c3.162 0 6.038-1.355 8.063-3.5M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}
