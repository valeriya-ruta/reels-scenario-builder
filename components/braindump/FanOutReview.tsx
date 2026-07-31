'use client';

import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, Trash2, ArrowRight } from 'lucide-react';
import DateSheet from '@/components/content/DateSheet';
import ContentTypeIcon from '@/components/ContentTypeIcon';
import ProposalActions from '@/components/propose/ProposalActions';
import { dayHeaderLabel } from '@/lib/content/calendar';
import { wouldFloodStaging } from '@/lib/content/staging';
import { setContentScheduledDate, deleteContentPiece } from '@/app/content-actions';
import type { CreatedStorytellingDay } from '@/app/storytelling-actions';

/**
 * Fan-out review — the answer to "one braindump = 2–3 days of storytelling".
 *
 * The generated days arrive as a scannable set of story PROPOSALS, each showing
 * its opening line in real type, the barrier it carries, and the day Ruta
 * proposes for it. Three moves per card and nothing else:
 *   • change the date (opens the app's own picker)
 *   • drop it (destructive → red, and it really deletes; dropped is not parked)
 *   • leave it as proposed
 * Plus one decisive verb for the whole set: accept the spread.
 *
 * Keeping a story WITHOUT a date is allowed but deliberately not a button — it
 * is what happens when you clear a date, and those land in staging (Part 4)
 * rather than on the calendar.
 */

export type FanOutDay = CreatedStorytellingDay & { dropped?: boolean };

export default function FanOutReview({
  days,
  reason,
  consecutive,
  onDone,
  onRegenerate,
  onTweak,
  regenerating,
}: {
  days: CreatedStorytellingDay[];
  /** The engine's first-person one-liner (why single vs saga). */
  reason: string;
  consecutive: boolean;
  onDone: () => void;
  onRegenerate: () => void;
  onTweak: () => void;
  regenerating?: boolean;
}) {
  const [items, setItems] = useState<FanOutDay[]>(days);
  const [dateFor, setDateFor] = useState<FanOutDay | null>(null);

  const live = useMemo(() => items.filter((d) => !d.dropped), [items]);

  const reschedule = useCallback((day: FanOutDay, date: string | null) => {
    setItems((cur) =>
      cur.map((d) => (d.id === day.id ? { ...d, scheduledDate: date ?? '' } : d)),
    );
    void setContentScheduledDate('storytelling_projects', day.id, date);
  }, []);

  // Dropped is DROPPED — not moved to a holding zone. The whole point of the
  // review is that the set shrinks to what the user will actually post.
  const drop = useCallback((day: FanOutDay) => {
    setItems((cur) => cur.map((d) => (d.id === day.id ? { ...d, dropped: true } : d)));
    void deleteContentPiece('storytelling_projects', day.id);
  }, []);

  const undated = useMemo(() => live.filter((d) => !d.scheduledDate), [live]);
  const floods = wouldFloodStaging(undated.length);

  const spreadLine = useMemo(() => {
    if (live.length <= 1) return null;
    const first = live[0]?.scheduledDate;
    if (!first) return null;
    return consecutive
      ? `${live.length} дні поспіль, з ${dayHeaderLabel(first)}`
      : `розкидала по вільних днях у календарі, з ${dayHeaderLabel(first)}`;
  }, [live, consecutive]);

  return (
    <div data-testid="fanout-review">
      <div className="mb-3">
        <p className="text-[13px] font-semibold text-[color:var(--foreground)]">
          {live.length > 1 ? `Розклала на ${live.length} дні` : 'Одна історія'}
        </p>
        {spreadLine ? (
          <p className="mt-0.5 text-[12px] text-[color:var(--text-muted)]">{spreadLine}</p>
        ) : null}
      </div>

      {/* The set itself — story cards, not rows. */}
      <ul className="max-h-[46vh] space-y-2 overflow-y-auto pb-1" data-testid="fanout-list">
        {live.map((day, i) => (
          <li
            key={day.id}
            data-testid="fanout-card"
            className="rounded-[16px] border border-[color:var(--border)] bg-white/90 p-3.5"
            style={{ boxShadow: 'var(--elev-1)' }}
          >
            <div className="flex items-center gap-2">
              <ContentTypeIcon type="stories" size={16} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight text-[color:var(--foreground)]">
                {day.name}
              </span>
              {live.length > 1 ? (
                <span className="shrink-0 rounded-[5px] bg-[color:var(--surface2)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[color:var(--text-secondary)]">
                  {i + 1}/{live.length}
                </span>
              ) : null}
            </div>

            {/* The opening line, in real type — what the story sounds like. */}
            {day.opening ? (
              <p className="mt-2 line-clamp-3 text-[15px] font-medium leading-snug tracking-tight text-[color:var(--foreground)]">
                {day.opening}
              </p>
            ) : null}

            <p className="mt-1.5 text-[11.5px] text-[color:var(--text-muted)]">
              {day.goal ? `${day.goal} · ` : ''}
              {day.storyCount} сторіс
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDateFor(day)}
                data-testid="fanout-date"
                className="app-pill flex-1 justify-center py-2 text-[12.5px]"
              >
                <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
                {day.scheduledDate ? dayHeaderLabel(day.scheduledDate) : 'Без дати'}
              </button>
              <a
                href={`/storytelling/${day.id}`}
                data-testid="fanout-open"
                className="app-icon-btn"
                aria-label="Відкрити"
                title="Відкрити"
              >
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </a>
              {/* Red is reserved for destructive — and this one really deletes. */}
              <button
                type="button"
                onClick={() => drop(day)}
                data-testid="fanout-drop"
                aria-label="Прибрати"
                title="Прибрати"
                className="app-icon-btn"
                style={{ color: '#dc2626' }}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {live.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-[color:var(--text-muted)]">
          Прибрала все. Можна згенерувати ще раз або підкрутити думку.
        </p>
      ) : null}

      {/* 4.4 — nothing generated gets dumped into staging in bulk. Everything
          here arrives already dated; if the user strips dates, say plainly where
          those pieces go and ask for the date now, while the intent is fresh. */}
      {undated.length > 0 ? (
        <p
          data-testid="fanout-staging-warning"
          className="mt-2 rounded-[12px] border px-3 py-2 text-[12.5px] leading-snug"
          style={{
            borderColor: floods ? 'rgba(217,119,38,0.5)' : 'var(--border)',
            backgroundColor: floods ? 'rgba(217,119,38,0.08)' : 'var(--surface1)',
            color: 'var(--foreground)',
          }}
        >
          ✻ {undated.length} без дати підуть у Розбір. Постав дату тим, які точно хочеш —
          потім буде важче вирішувати.
        </p>
      ) : null}

      <div className="mt-3">
        <ProposalActions
          rationale={reason}
          keepLabel={live.length > 1 ? 'Лишаємо цей розклад' : 'Лишаємо'}
          onKeep={onDone}
          onRegenerate={onRegenerate}
          onTweak={onTweak}
          regenerating={regenerating}
        />
      </div>

      <DateSheet
        open={dateFor !== null}
        onClose={() => setDateFor(null)}
        value={dateFor?.scheduledDate || null}
        onPick={(date) => {
          if (dateFor) reschedule(dateFor, date);
        }}
      />
    </div>
  );
}
