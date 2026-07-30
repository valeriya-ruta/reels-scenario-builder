'use client';

import { useRouter } from 'next/navigation';
import { CalendarDays, Sparkles } from 'lucide-react';
import ContentRows from '@/components/content/ContentRows';
import type { ContentPiece } from '@/lib/content/contentPiece';
import { STATUS_LABELS } from '@/lib/content/statusSystem';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';

/**
 * "Сьогодні" — the assistant answer to the only question that matters on open:
 * *what am I posting today?*
 *
 * The app is a producer, not a menu of buttons: if something is scheduled for
 * today we lead with it (and how far along it is); if nothing is, we don't nag
 * the user to "create a reel" — we offer the one low-friction way in (говори,
 * i.e. braindump) and let the type be decided later.
 */
export default function TodayPlan({ pieces }: { pieces: ContentPiece[] }) {
  const router = useRouter();
  const hasToday = pieces.length > 0;

  // How much of today's plan is already finished (Готово / Опубліковано).
  const done = pieces.filter((p) => p.status === 'ready' || p.status === 'published').length;

  return (
    <section className="space-y-2.5" aria-labelledby="today-heading">
      <div className="flex items-center justify-between px-0.5">
        <h2 id="today-heading" className="app-section-label">
          Сьогодні
        </h2>
        {hasToday ? (
          <span className="text-[12px] font-medium text-[color:var(--text-muted)]">
            {done}/{pieces.length} готово
          </span>
        ) : null}
      </div>

      {hasToday ? (
        <div className="app-card overflow-hidden px-1.5 py-0.5">
          <ContentRows pieces={pieces} />
        </div>
      ) : (
        <div className="app-card overflow-hidden">
          <div className="px-5 pb-4 pt-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)]">
                <CalendarDays className="h-5 w-5 text-[color:var(--accent)]" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-snug text-[color:var(--foreground)]">
                  На сьогодні нічого не заплановано
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--text-muted)]">
                  Не думай, що знімати. Просто розкажи, що в голові — решту зберу я.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 border-t border-[color:var(--border)] p-3">
            <button
              type="button"
              data-testid="today-braindump"
              onClick={() => window.dispatchEvent(new CustomEvent(OPEN_BRAINDUMP_FRESH_EVENT))}
              className="app-btn-primary flex-1"
            >
              <Sparkles className="h-4 w-4" strokeWidth={2.2} />
              Наговорити ідею
            </button>
            <button
              type="button"
              data-testid="today-plan-link"
              onClick={() => router.push('/plan')}
              className="app-pill px-4 py-2.5"
            >
              План
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Exported for tests/readability: the label shown for a piece's stage. */
export const statusLabelFor = (p: ContentPiece) => STATUS_LABELS[p.status];
