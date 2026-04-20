'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { localizeAuthError } from '@/lib/authErrorMessages';
import { useRouter } from 'next/navigation';

type AuthFlow = 'sign-in' | 'sign-up' | 'forgot-password';

type LoginFormProps = {
  initialFlow?: AuthFlow;
};

export default function LoginForm({ initialFlow = 'sign-in' }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [flow, setFlow] = useState<AuthFlow>(initialFlow);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (flow === 'forgot-password') {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/reset-password`,
        });
        if (resetError) throw resetError;
        setForgotSent(true);
        return;
      }

      if (flow === 'sign-up') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name, phone } },
        });
        if (signUpError) throw signUpError;
        // TODO: re-enable payments (WayForPay card verification step) after temporary bypass.
        router.push('/trial/success');
        router.refresh();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(localizeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const isSignUp = flow === 'sign-up';
  const isForgot = flow === 'forgot-password';

  return (
    <form
      onSubmit={handleSubmit}
      className="card-shadow space-y-4 rounded-xl border border-[color:var(--border)] bg-white p-6"
    >
      {error && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {forgotSent && isForgot && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Якщо акаунт існує, надіслано лист із посиланням для відновлення пароля. Перевір пошту.
        </div>
      )}

      {isSignUp && (
        <>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-zinc-700">
              Як тебе звати?
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required={isSignUp}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-normal text-zinc-900 placeholder-zinc-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/25"
              placeholder="Як тебе звати?"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-zinc-700">
              Номер телефону
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required={isSignUp}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-normal text-zinc-900 placeholder-zinc-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/25"
              placeholder="+380..."
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
          Електронна пошта
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-normal text-zinc-900 placeholder-zinc-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/25"
          placeholder="you@example.com"
        />
      </div>

      {!isForgot && (
        <div className="!mt-5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
              Пароль
            </label>
            {flow === 'sign-in' && (
              <button
                type="button"
                onClick={() => {
                  setFlow('forgot-password');
                  setForgotSent(false);
                  setError(null);
                }}
                className="cursor-pointer text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-800"
              >
                Забули пароль?
              </button>
            )}
          </div>
          <div className="relative mt-1">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isForgot}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-3 pr-11 text-sm leading-normal text-zinc-900 placeholder-zinc-500 focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/25"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex cursor-pointer items-center rounded-r px-2.5 text-zinc-500 transition-colors hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
              aria-label={showPassword ? 'Приховати пароль' : 'Показати пароль'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || (isForgot && forgotSent)}
        className="btn-primary w-full rounded-xl bg-[color:var(--accent)] px-4 py-2 font-medium text-white transition-[background,transform] hover:brightness-110 disabled:opacity-50"
      >
        {loading
          ? 'Завантаження...'
          : isForgot
            ? 'Надіслати посилання'
            : isSignUp
              ? 'Зареєструватися'
              : 'Увійти'}
      </button>

      {isForgot ? (
        <button
          type="button"
          onClick={() => {
            setFlow('sign-in');
            setForgotSent(false);
            setError(null);
          }}
          className="w-full cursor-pointer text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-800"
        >
          Повернутися до входу
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setFlow(isSignUp ? 'sign-in' : 'sign-up');
            setError(null);
          }}
          className="w-full cursor-pointer text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-800"
        >
          {isSignUp ? 'Вже є акаунт? Увійти' : 'Немає акаунту? Зареєструватися'}
        </button>
      )}
    </form>
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
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
