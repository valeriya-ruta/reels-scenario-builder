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
    <header>
      <h1 data-testid="home-greeting" suppressHydrationWarning className="app-title">
        {greetingLine(hour, name)}
      </h1>
      <p className="app-subtitle">Готова створювати?</p>
    </header>
  );
}
