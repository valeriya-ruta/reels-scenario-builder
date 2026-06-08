'use client';

import { useEffect, useState } from 'react';
import { greetingLine } from '@/lib/greeting';

/**
 * Time-of-day aware greeting. Computes from the local hour on mount (and so
 * recomputes on every load / navigation to Home). Renders a stable first paint
 * using the server-evaluated hour, then reconciles to the client's real local
 * hour to avoid hydration mismatch while still being "live".
 */
export default function Greeting({ name }: { name?: string | null }) {
  const [hour, setHour] = useState<number>(() => new Date().getHours());

  useEffect(() => {
    setHour(new Date().getHours());
  }, []);

  return (
    <header className="space-y-1">
      <h1
        data-testid="home-greeting"
        suppressHydrationWarning
        className="font-display text-2xl font-bold tracking-tight text-black sm:text-3xl"
      >
        {greetingLine(hour, name)} <span aria-hidden>👋</span>
      </h1>
      <p className="text-sm leading-normal text-zinc-500">Готова створювати?</p>
    </header>
  );
}
