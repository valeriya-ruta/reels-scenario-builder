'use client';

import confetti from 'canvas-confetti';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabaseClient';

const STORAGE_KEY_PREFIX = 'ruta_welcome_seen_';
const SESSION_FLAG = 'ruta_show_welcome';

function firstNameFromUser(metaName: string | undefined, email: string | null, profileName: string | null): string {
  if (profileName?.trim()) {
    return profileName.trim().split(/\s+/)[0] ?? '';
  }
  if (metaName?.trim()) {
    return metaName.trim().split(/\s+/)[0] ?? '';
  }
  if (email?.includes('@')) {
    return email.split('@')[0] ?? '';
  }
  return 'друже';
}

function fireWelcomeConfetti() {
  const end = Date.now() + 2_000;
  const colors = ['#004BA8', '#2563eb', '#fbbf24', '#f472b6', '#34d399'];

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      colors,
      ticks: 200,
      gravity: 1.1,
      scalar: 1.1,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      colors,
      ticks: 200,
      gravity: 1.1,
      scalar: 1.1,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };

  confetti({
    particleCount: 100,
    spread: 80,
    origin: { y: 0.55 },
    colors,
    ticks: 300,
    gravity: 0.9,
    scalar: 1.05,
  });
  frame();
}

export default function WelcomeModal() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const userIdRef = useRef<string | null>(null);
  const confettiFiredForOpenRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      userIdRef.current = user.id;

      try {
        if (typeof localStorage !== 'undefined') {
          if (localStorage.getItem(STORAGE_KEY_PREFIX + user.id) === '1') {
            return;
          }
        }
      } catch {
        // ignore
      }

      const welcomeQuery = searchParams.get('welcome') === '1';
      let fromSession = false;
      try {
        fromSession = sessionStorage.getItem(SESSION_FLAG) === '1';
      } catch {
        // ignore
      }

      if (!welcomeQuery && !fromSession) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle<{ display_name: string | null }>();

      const meta = user.user_metadata as { full_name?: string } | undefined;
      const raw = firstNameFromUser(meta?.full_name, user.email ?? null, profile?.display_name ?? null);
      const pretty = raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;

      setFirstName(pretty);
      setOpen(true);

      try {
        sessionStorage.removeItem(SESSION_FLAG);
      } catch {
        // ignore
      }
    })();
  }, [searchParams]);

  useEffect(() => {
    if (!open) {
      confettiFiredForOpenRef.current = false;
      return;
    }
    if (confettiFiredForOpenRef.current) return;
    confettiFiredForOpenRef.current = true;
    const t = window.setTimeout(() => fireWelcomeConfetti(), 150);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const dismiss = useCallback(() => {
    const id = userIdRef.current;
    if (id) {
      try {
        localStorage.setItem(STORAGE_KEY_PREFIX + id, '1');
      } catch {
        // ignore
      }
    }
    setOpen(false);
    router.replace('/dashboard');
  }, [router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="welcome-modal-title">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={dismiss}
        aria-label="Закрити вітання"
      />

      <div
        className="relative z-[1] w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-white px-8 py-10 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="welcome-modal-title" className="font-display text-2xl font-bold tracking-tight text-zinc-900 sm:text-[1.65rem]">
          {firstName}, вітаю в RUTA!
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          Рада бути твоєю контент-подружкою. Давай почнемо створювати контент!
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="btn-primary mt-8 w-full rounded-xl bg-[color:var(--accent)] px-6 py-3.5 text-sm font-semibold text-white transition-[background,transform] hover:brightness-110"
        >
          Почати!
        </button>
      </div>
    </div>
  );
}
