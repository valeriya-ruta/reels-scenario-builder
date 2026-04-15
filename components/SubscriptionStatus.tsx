'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type StatusPayload = {
  phase: string | null;
  hasAccess: boolean;
  phaseEndsAt: string | null;
  cardPan: string | null;
};

function formatDateDdMmYyyy(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('.');
}

export default function SubscriptionStatus() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/payments/status', { credentials: 'include' });
        const json = (await res.json()) as StatusPayload & { error?: string };
        if (!res.ok) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setData({
            phase: json.phase ?? null,
            hasAccess: json.hasAccess,
            phaseEndsAt: json.phaseEndsAt ?? null,
            cardPan: json.cardPan ?? null,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Помилка завантаження');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-[color:var(--border)] bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
        Завантаження підписки…
      </div>
    );
  }

  const phase = data.phase ?? '';
  const phaseEnds = formatDateDdMmYyyy(data.phaseEndsAt);

  let message: React.ReactNode = null;

  if (phase === 'pending_verify') {
    message = (
      <span>
        Підтвердіть картку щоб почати —{' '}
        <Link href="/subscribe" className="font-medium text-[color:var(--accent)] underline-offset-2 hover:underline">
          перейти до оплати
        </Link>
      </span>
    );
  } else if (phase === 'trial') {
    message = <span>Безкоштовний пробний період · до {phaseEnds}</span>;
  } else if (phase === 'discounted') {
    message = <span>Ruta Pro · $5/міс · спецціна першої хвилі ✓</span>;
  } else if (phase === 'full') {
    message = <span>Ruta Pro · $10/міс ✓</span>;
  } else if (phase === 'cancelled') {
    message = (
      <span>
        Підписка неактивна —{' '}
        <Link href="/subscribe" className="font-medium text-[color:var(--accent)] underline-offset-2 hover:underline">
          поновити?
        </Link>
      </span>
    );
  } else {
    message = <span>Статус підписки оновлюється…</span>;
  }

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-white px-4 py-3 text-sm leading-normal text-zinc-800 shadow-sm">
      <p>{message}</p>
      {data.cardPan ? (
        <p className="mt-1.5 text-xs text-zinc-600">Картка: {data.cardPan}</p>
      ) : null}
    </div>
  );
}
