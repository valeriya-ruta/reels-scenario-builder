'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useNavBadges } from '@/components/NavBadgeContext';
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

  const actionBtnClass =
    'rounded-xl px-5 py-3 text-sm font-semibold shadow-md transition-colors';
  const actionBtnEnabled = `${actionBtnClass} cursor-pointer bg-[#004BA8] text-white hover:bg-[#0d5bb8]`;
  const actionBtnDisabled = `${actionBtnClass} cursor-not-allowed bg-zinc-200 text-zinc-500 shadow-none`;
  const actionBtnLoading = `${actionBtnClass} cursor-wait bg-[#004BA8]/70 text-white/80 shadow-none`;

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <div className="pt-2">
        <h1 className="text-center text-2xl font-bold tracking-tight text-black sm:text-3xl">
          Виплесни всі свої думки
        </h1>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-8">
          <div className="order-2 flex w-full flex-col gap-3 lg:order-2 lg:w-56 lg:shrink-0 lg:pt-1">
            <span className="relative block w-full">
              <button
                type="button"
                onClick={goReels}
                disabled={!canUseContentActions || isBusy}
                className={`relative z-0 w-full ${
                  loading === 'reels'
                    ? actionBtnLoading
                    : canUseContentActions && !isBusy
                      ? actionBtnEnabled
                      : actionBtnDisabled
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
                className={`relative z-0 w-full ${
                  canUseContentActions && !isBusy ? actionBtnEnabled : actionBtnDisabled
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
            <button
              type="button"
              disabled
              className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] px-5 py-3 text-sm font-medium text-zinc-500"
            >
              Зробити каруселі
              <span className="rounded bg-[#ebebeb] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                незабаром
              </span>
            </button>
          </div>

          <div className="order-1 min-w-0 flex-1 lg:order-1">
            <textarea
              value={rant}
              onChange={(e) => setRant(e.target.value)}
              disabled={isBusy}
              placeholder="Про що будемо розповідати сьогодні?"
              className="min-h-[88px] w-full resize-y rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-left text-sm leading-relaxed text-black placeholder:text-zinc-400 focus:border-[#004BA8] focus:ring-2 focus:ring-[#004BA8]/20 disabled:opacity-60 sm:min-h-[100px]"
            />
            <p className="mt-2 text-left text-xs text-zinc-500">
              {canUseContentActions
                ? `У тексті ${wordCount} ${wordLabel(wordCount)} — можна переходити до рілсів або сторітелу.`
                : `Мінімум ${MIN_WORDS_FOR_ACTIONS} слів, щоб увімкнути кнопки. Зараз: ${wordCount}. Залишилось: ${wordsNeeded}.`}
            </p>
            {error && (
              <p className="mt-2 text-left text-xs text-red-600">{error}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/competitor-analysis"
          prefetch
          className="group flex h-full min-h-[106px] gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-6 text-left text-inherit no-underline shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all hover:border-[#004BA8]/35 hover:shadow-md"
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
            <span className="font-display block text-lg font-semibold text-black group-hover:text-[#004BA8]">
              Аналіз конкурентів
            </span>
            <span className="mt-2 block text-sm text-zinc-600">Подивись, що залітає в інших.</span>
          </div>
        </Link>
        <div
          className="flex h-full min-h-[106px] gap-4 rounded-2xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-6 text-left select-none"
          aria-disabled="true"
        >
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
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
              <h2 className="font-display text-lg font-semibold text-zinc-500">Статистика</h2>
              <span className="shrink-0 rounded bg-[#ebebeb] px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                незабаром
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-500">Тут з&apos;являться твої цифри та динаміка.</p>
          </div>
        </div>
      </div>

      {SHOW_TREND_FORMATS_SECTION && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-black">🔥 Трендові формати</h2>
          <p className="mt-1 text-sm text-zinc-600">Оновлюємо вручну — забирай ідеї для стрічки.</p>
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TREND_ITEMS.map((item) => (
              <a
                key={item.title}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-[200px] shrink-0 rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 shadow-sm transition-transform hover:-translate-y-0.5 hover:border-[#004BA8]/30 hover:shadow-md"
              >
                <p className="text-sm font-semibold text-black">{item.title}</p>
                <p className="mt-1 truncate text-xs text-zinc-500">{item.url.replace(/^https:\/\//, '')}</p>
              </a>
            ))}
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
