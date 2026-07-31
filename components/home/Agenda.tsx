'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Sparkles } from 'lucide-react';
import ContentRows from '@/components/content/ContentRows';
import type { ContentPiece } from '@/lib/content/contentPiece';
import { agendaHeading, sortedDayKeys } from '@/lib/content/calendar';
import { OPEN_BRAINDUMP_FRESH_EVENT } from '@/lib/content/braindumpIdeaEvent';

/**
 * The agenda — the app's answer to the only question that matters on open:
 * *what am I posting today, and what's next?*
 *
 * Date-grouped list (Craft / Superlist pattern): «Сьогодні · 30 лип», «Завтра ·
 * 31 лип», then plain dated days. The app leads with the plan like a producer
 * would, instead of offering a menu of formats — the user's problem isn't
 * picking a format, it's knowing what to make.
 */
export default function Agenda({
  pieces,
  todayKey,
}: {
  /** Everything scheduled from today onwards, any type. */
  pieces: ContentPiece[];
  todayKey: string;
}) {
  const router = useRouter();

  const groups = useMemo(() => {
    const keys = sortedDayKeys(pieces.map((p) => p.scheduledDate));
    return keys.map((key) => ({
      key,
      heading: agendaHeading(key, todayKey),
      items: pieces.filter((p) => p.scheduledDate?.slice(0, 10) === key),
    }));
  }, [pieces, todayKey]);

  if (groups.length === 0) {
    return (
      <section aria-labelledby="agenda-heading" className="space-y-2.5">
        <h2 id="agenda-heading" className="app-section-label px-0.5">
          Що постимо
        </h2>
        <div className="app-card overflow-hidden">
          <div className="px-5 pb-4 pt-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)]">
                <CalendarDays className="h-5 w-5 text-[color:var(--accent)]" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-snug text-[color:var(--foreground)]">
                  Нічого не заплановано
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
            <button type="button" onClick={() => router.push('/plan')} className="app-pill px-4 py-2.5">
              План
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="agenda-heading" className="space-y-4">
      <h2 id="agenda-heading" className="app-section-label px-0.5">
        Що постимо
      </h2>

      {groups.map((group) => {
        const done = group.items.filter(
          (p) => p.status === 'ready' || p.status === 'published',
        ).length;
        return (
          <div key={group.key} className="space-y-1.5" data-testid="agenda-group" data-day={group.key}>
            <div className="flex items-center justify-between px-0.5">
              <h3
                className={`text-[13px] font-bold tracking-tight ${
                  group.key === todayKey
                    ? 'text-[color:var(--accent)]'
                    : 'text-[color:var(--foreground)]'
                }`}
              >
                {group.heading}
              </h3>
              <span className="text-[12px] font-medium text-[color:var(--text-muted)]">
                {done}/{group.items.length}
              </span>
            </div>
            <div>
              <ContentRows pieces={group.items} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
