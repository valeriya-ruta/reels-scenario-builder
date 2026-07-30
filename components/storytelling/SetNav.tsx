'use client';

import { useRouter } from 'next/navigation';
import { dayHeaderLabel } from '@/lib/content/calendar';

export type SetSibling = {
  id: string;
  name: string;
  scheduledDate: string | null;
  setIndex: number | null;
};

/**
 * Set navigator for a multi-day storytelling.
 *
 * A saga is N separate storytellings, so once you're inside day 2 there is
 * nothing telling you days 1 and 3 exist. This is that missing context: a
 * "Частина 2 з 3" line plus one tap to each sibling day — without a parent
 * object, since each day owns its own date and status.
 */
export default function SetNav({
  siblings,
  currentId,
}: {
  siblings: SetSibling[];
  currentId: string;
}) {
  const router = useRouter();
  if (siblings.length < 2) return null;

  const current = siblings.find((s) => s.id === currentId);

  return (
    <div className="app-card mb-4 px-3 py-2.5" data-testid="set-nav">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
        Частина {current?.setIndex ?? '?'} з {siblings.length} · сага
      </p>
      <div className="flex flex-wrap gap-1.5">
        {siblings.map((s) => {
          const active = s.id === currentId;
          return (
            <button
              key={s.id}
              type="button"
              data-testid="set-nav-day"
              onClick={() => {
                if (!active) router.push(`/storytelling/${s.id}`);
              }}
              className="rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {s.scheduledDate ? dayHeaderLabel(s.scheduledDate) : `День ${s.setIndex ?? '?'}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
