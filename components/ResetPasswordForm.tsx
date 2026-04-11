'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';
import { localizeAuthError } from '@/lib/authErrorMessages';

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'checking' | 'form' | 'invalid'>('checking');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) {
        setStatus('form');
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) {
        setStatus('form');
      }
    });

    const t = setTimeout(() => {
      if (cancelled) return;
      setStatus((s) => (s === 'checking' ? 'invalid' : s));
    }, 8000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(t);
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Пароль має бути не коротше 6 символів');
      return;
    }
    if (password !== confirmPassword) {
      setError('Паролі не збігаються');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.push('/projects');
      router.refresh();
    } catch (err: unknown) {
      setError(localizeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  if (status === 'checking') {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-600 shadow-sm">
        Завантаження…
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-zinc-700">
          Посилання недійсне або застаріло. Спробуй надіслати нове зі сторінки входу.
        </p>
        <Link
          href="/"
          className="inline-block cursor-pointer text-sm text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
        >
          На головну
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
    >
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Новий пароль</h2>
        <p className="mt-1 text-sm text-zinc-600">Введи новий пароль для свого акаунта.</p>
      </div>

      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-zinc-700">
          Новий пароль
        </label>
        <input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          placeholder="••••••••"
        />
      </div>

      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-zinc-700">
          Підтвердження пароля
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-[#004BA8] px-4 py-2 font-medium text-white transition-colors hover:bg-[#0d5bb8] disabled:opacity-50"
      >
        {loading ? 'Збереження…' : 'Зберегти пароль'}
      </button>
    </form>
  );
}
