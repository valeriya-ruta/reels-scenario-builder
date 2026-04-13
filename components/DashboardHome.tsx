'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useNavBadges } from '@/components/NavBadgeContext';
import { useToast } from '@/components/ToastProvider';
import { generateReelFromRant } from '@/app/actions';

const MIN_WORDS_FOR_ACTIONS = 50;

const DISABLED_CONTENT_ACTION_TOOLTIP =
  `Щоб активувати цю кнопку, напиши щонайменше ${MIN_WORDS_FOR_ACTIONS} слів у полі вище.`;

/** Увімкни, щоб знову показати блок «Трендові формати». */
const SHOW_TREND_FORMATS_SECTION = false;

const TREND_ITEMS = [
  { title: 'Цей формат вибухає', url: 'https://www.instagram.com/reels/' },
  { title: 'Танець тижня', url: 'https://www.tiktok.com/' },
  { title: 'Топ звук зараз', url: 'https://www.instagram.com/reels/' },
] as const;

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export default function DashboardHome() {
  const router = useRouter();
  const { setBadge } = useNavBadges();
  const toast = useToast();
  const [rant, setRant] = useState('');
  const [loading, setLoading] = useState<'reels' | 'storytelling' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wordCount = useMemo(() => countWords(rant), [rant]);
  const canUseContentActions = wordCount >= MIN_WORDS_FOR_ACTIONS;
  const isBusy = loading !== null;

  const goReels = async () => {
    if (!canUseContentActions || isBusy) return;
    setLoading('reels');
    setError(null);

    const result = await generateReelFromRant(rant);

    if (!result.ok) {
      setError(result.error);
      toast?.pushToast(result.error, 'error');
      setLoading(null);
      return;
    }

    setBadge('reels', true);
    router.push(`/project/${result.projectId}`);
  };

  const goStorytell = () => {
    if (!canUseContentActions || isBusy) return;
    setBadge('storytelling', true);
    router.push('/storytellings');
  };

  const wordsNeeded = Math.max(0, MIN_WORDS_FOR_ACTIONS - wordCount);

  const primaryBtn =
    'btn-primary w-full rounded-xl px-5 py-3 text-sm font-semibold shadow-md transition-[background,transform,opacity] duration-150 ease-out';
  const primaryOn = `${primaryBtn} cursor-pointer bg-[color:var(--accent)] text-white hover:brightness-110`;
  const primaryLoading = `${primaryBtn} cursor-wait bg-[color:var(--accent)]/70 text-white/90 shadow-none`;
  const primaryOff = `${primaryBtn} cursor-not-allowed bg-zinc-200 text-zinc-500 shadow-none`;

  const secondaryOn =
    'w-full rounded-xl border-2 border-[color:var(--accent)] bg-white px-5 py-3 text-sm font-semibold text-[color:var(--accent)] shadow-sm transition-[background,border-color,transform,opacity] duration-150 ease-out hover:bg-[color:var(--accent-soft)]';
  const secondaryOff =
    'w-full cursor-not-allowed rounded-xl border-2 border-zinc-200 bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-500 shadow-none';

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="space-y-6 pt-2">
        <h1 className="font-display text-center text-2xl font-bold tracking-tight text-black sm:text-3xl">
          Виплесни всі свої думки
        </h1>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-8">
          <div className="order-2 flex w-full flex-col gap-3 lg:order-2 lg:w-56 lg:shrink-0 lg:pt-1">
            <span className="relative block w-full">
              <button
                type="button"
                onClick={goReels}
                disabled={!canUseContentActions || isBusy}
                className={`relative z-0 ${
                  loading === 'reels'
                    ? primaryLoading
                    : canUseContentActions && !isBusy
                      ? primaryOn
                      : primaryOff
                }`}
              >
                {loading === 'reels' ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Створюю сценарій…
                  </span>
                ) : (
                  'Написати рілс'
                )}
              </button>
              {!canUseContentActions && !isBusy && (
                <span
                  className="absolute inset-0 z-10 cursor-help rounded-xl"
                  title={DISABLED_CONTENT_ACTION_TOOLTIP}
                  aria-hidden
                />
              )}
            </span>
            <span className="relative block w-full">
              <button
                type="button"
                onClick={goStorytell}
                disabled={!canUseContentActions || isBusy}
                className={`relative z-0 ${
                  canUseContentActions && !isBusy ? secondaryOn : secondaryOff
                }`}
              >
                Написати сторітел
              </button>
              {!canUseContentActions && !isBusy && (
                <span
                  className="absolute inset-0 z-10 cursor-help rounded-xl"
                  title={DISABLED_CONTENT_ACTION_TOOLTIP}
                  aria-hidden
                />
              )}
            </span>
            <Link
              href="/carousel"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--border)] bg-white px-5 py-3 text-sm font-medium text-zinc-800 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[color:var(--accent)]/35 hover:shadow-md"
            >
              Зробити карусель
            </Link>
          </div>

          <div className="order-1 min-w-0 flex-1 lg:order-1">
            <textarea
              value={rant}
              onChange={(e) => setRant(e.target.value)}
              disabled={isBusy}
              placeholder="Про що будемо розповідати сьогодні?"
              className="min-h-[88px] w-full resize-y rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-left text-sm leading-normal text-black placeholder:text-zinc-400 focus:border-[color:var(--accent)] focus:shadow-[inset_0_0_0_2px_var(--accent)] focus:outline-none focus:ring-0 disabled:opacity-60 sm:min-h-[100px]"
            />
            <p className="mt-2 text-left text-xs leading-normal text-zinc-600">
              {canUseContentActions
                ? `У тексті ${wordCount} ${wordLabel(wordCount)} — можна переходити до рілсів або сторітелу.`
                : `Мінімум ${MIN_WORDS_FOR_ACTIONS} слів, щоб увімкнути кнопки. Зараз: ${wordCount}. Залишилось: ${wordsNeeded}.`}
            </p>
            {error && (
              <p className="mt-2 text-left text-xs leading-normal text-red-700">{error}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid min-h-[124px] grid-cols-1 gap-6 md:grid-cols-2">
        <Link
          href="/competitor-analysis"
          prefetch
          className="card-shadow group flex min-h-[124px] gap-4 rounded-2xl border border-[color:var(--border)] bg-white p-5 text-left text-inherit no-underline transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[color:var(--accent)]/35 hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)]"
        >
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
            <Image
              src="/competitor-analysis-icon.png"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 object-contain object-center"
            />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <span className="font-display block text-lg font-semibold text-black group-hover:text-[color:var(--accent)]">
              Аналіз конкурентів
            </span>
            <span className="mt-2 block text-sm leading-normal text-zinc-600">Подивись, що залітає в інших.</span>
          </div>
        </Link>
        <div
          className="card-shadow flex min-h-[124px] cursor-not-allowed gap-4 rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface)] p-5 text-left opacity-40 select-none"
          aria-disabled="true"
        >
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center opacity-100">
            <Image
              src="/stats-trend-icon.png"
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 object-contain object-center"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-zinc-600">Статистика</h2>
              <span className="shrink-0 rounded-full bg-[color:var(--surface2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                скоро
              </span>
            </div>
            <p className="mt-2 text-sm leading-normal text-zinc-600">Тут з&apos;являться твої цифри та динаміка.</p>
          </div>
        </div>
      </div>

      {SHOW_TREND_FORMATS_SECTION && (
        <section className="mt-10 space-y-4">
          <h2 className="font-display text-lg font-semibold text-black">Трендові формати</h2>
          <p className="text-sm leading-normal text-zinc-600">Оновлюємо вручну — забирай ідеї для стрічки.</p>
          <div className="rounded-xl border border-[color:var(--border)] border-l-[3px] border-l-[color:var(--accent)] bg-[color:var(--surface)]/80 p-4">
            <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TREND_ITEMS.map((item) => (
                <a
                  key={item.title}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-[200px] shrink-0 rounded-xl border border-[color:var(--border)] bg-white px-4 py-3 card-shadow transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-[color:var(--accent)]/30 hover:shadow-md"
                >
                  <p className="text-sm font-semibold text-black">{item.title}</p>
                  <p className="mt-1 truncate text-xs leading-normal text-zinc-600">{item.url.replace(/^https:\/\//, '')}</p>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function wordLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 > 10 && mod100 < 20) return 'слів';
  if (mod10 === 1) return 'слово';
  if (mod10 >= 2 && mod10 <= 4) return 'слова';
  return 'слів';
}
