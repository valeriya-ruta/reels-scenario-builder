'use client';

import { useState } from 'react';
import { ChevronLeft, Check, Plus, Link as LinkIcon, Lock } from 'lucide-react';
import BackLink from '@/components/ui/BackLink';
import BottomSheet from '@/components/ui/BottomSheet';
import { addStandalonePostedLink } from '@/app/posted-actions';
import { TIERS, tierProgress, remainingLabel } from '@/lib/insights/postedLink';

/**
 * The gamification page behind the coin (Prompt 3) + the standalone link-add
 * (Prompt 4).
 *
 * Reward LABELS are placeholders by instruction; the thresholds, the counter and
 * the "ще N постів" maths are all real, so swapping in actual prizes later is a
 * one-line edit in `TIERS` and nothing here changes.
 */
export default function RewardsView({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = tierProgress(count);

  const add = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await addStandalonePostedLink(url);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCount(res.count);
    setUrl('');
    setAddOpen(false);
  };

  return (
    <div className="app-canvas">
      <div className="app-page pb-28">
        <div className="mb-5 flex items-center gap-1">
          <BackLink fallbackHref="/dashboard" ariaLabel="Назад" className="app-icon-btn shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </BackLink>
          <h1 className="app-title">Нагороди</h1>
        </div>

        {/* The live number — the same one the pop-up shows. */}
        <div className="app-card px-5 py-6 text-center">
          <p className="text-[44px] font-bold leading-none tabular-nums tracking-tight text-[color:var(--foreground)]">
            {count}
          </p>
          <p className="mt-2 text-[13px] text-[color:var(--text-muted)]">
            {count === 1 ? 'опублікований пост' : 'опублікованих постів'}
          </p>
          <p
            data-testid="rewards-remaining"
            className="mt-4 text-[15px] font-semibold text-[color:var(--accent)]"
          >
            {remainingLabel(progress)}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--surface2)]">
            <div
              className="h-full rounded-full bg-[color:var(--accent)]"
              style={{
                width: `${Math.round(progress.fraction * 100)}%`,
                transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
              }}
            />
          </div>
        </div>

        <section className="mt-6">
          <h2 className="app-section-label mb-2 px-0.5">Рівні</h2>
          <ul className="app-card divide-y divide-[color:var(--border)] px-4">
            {TIERS.map((tier) => {
              const done = count >= tier.threshold;
              const isNext = progress.next?.threshold === tier.threshold;
              return (
                <li key={tier.threshold} className="flex items-center gap-3 py-3.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: done
                        ? 'var(--success)'
                        : isNext
                          ? 'var(--accent-soft)'
                          : 'var(--surface2)',
                    }}
                  >
                    {done ? (
                      <Check className="h-4 w-4 text-white" strokeWidth={2.6} />
                    ) : (
                      <Lock
                        className="h-3.5 w-3.5"
                        strokeWidth={2}
                        style={{ color: isNext ? 'var(--accent)' : 'var(--text-muted)' }}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold text-[color:var(--foreground)]">
                      {tier.label}
                    </span>
                    <span className="text-[12px] text-[color:var(--text-muted)]">
                      {tier.threshold} постів
                    </span>
                  </span>
                  {isNext ? (
                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-[color:var(--accent)]">
                      {progress.remaining} лишилось
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="app-section-label mb-2 px-0.5">Як це працює</h2>
          <div className="app-card px-4 py-4 text-[13.5px] leading-relaxed text-[color:var(--text-secondary)]">
            <p>
              Щоразу, коли ти публікуєш щось і кидаєш сюди посилання, лічильник росте — і я
              підтягую, як цей пост зайшов.
            </p>
            <p className="mt-2.5">
              З цієї статистики я бачу, що саме працює у тебе, і будую наступні ідеї навколо
              твоїх сильних тем. Тому кожне посилання — це і крок до нагороди, і точніші ідеї.
            </p>
            <p className="mt-2.5">
              Пости, зроблені поза Ruta, теж рахуються — просто додай посилання нижче.
            </p>
          </div>
        </section>
      </div>

      {/* Thumb zone (§1 of the UX rounds): the repeated action lives at the
          bottom — but ABOVE the nav, not under it. This bar used to be pinned
          at `bottom-0` with a lower z-index than the floating nav, so «Додати
          ще одне» rendered behind it and could not be tapped at all (Prompt 10).
          `.app-action-bar` pins it at `--nav-clear` instead. */}
      <div
        className="app-action-bar border-t border-[color:var(--border)] bg-[color:var(--background)]/95 px-4 pb-3 pt-3 backdrop-blur"
        style={{ boxShadow: '0 -2px 20px rgba(0,0,0,0.06)' }}
      >
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            data-testid="rewards-add"
            className="app-btn-primary w-full"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            Додати ще одне
          </button>
        </div>
      </div>

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="Додати посилання">
        <p className="px-1 pb-3 text-[13.5px] leading-relaxed text-[color:var(--text-secondary)]">
          Опублікувала щось не через Ruta? Кинь посилання — воно теж піде в лічильник, і я
          підтягну статистику.
        </p>
        <label className="relative block">
          <LinkIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]"
            aria-hidden
          />
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
            placeholder="instagram.com/p/…"
            aria-label="Посилання на пост"
            data-testid="rewards-add-input"
            className="w-full rounded-[12px] border border-[color:var(--border)] bg-white py-3 pl-9 pr-3 text-[15px] outline-none focus:border-[color:var(--accent)]"
          />
        </label>
        {error ? (
          <p role="alert" className="mt-2 px-1 text-[13px] text-[color:var(--text-secondary)]">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || url.trim().length === 0}
          data-testid="rewards-add-save"
          className="app-btn-primary mt-4 w-full"
        >
          {busy ? 'Додаю…' : 'Додати'}
        </button>
      </BottomSheet>
    </div>
  );
}
