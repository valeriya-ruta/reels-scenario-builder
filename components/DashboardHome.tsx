'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import WelcomeModal from '@/components/WelcomeModal';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useNavBadges } from '@/components/NavBadgeContext';
import { useRantResults } from '@/components/RantResultsContext';
import { generateReelFromRant } from '@/app/actions';
import { createStorytellingProjectFromRant } from '@/app/storytelling-actions';
import { createCarouselProjectFromRant } from '@/app/carousel-actions';
import RantInput from '@/components/RantInput';
import type { CarouselRantOutput } from '@/lib/carouselTypes';

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

const WORKSHOP_LESSONS = [
  { label: 'Урок 1', embedUrl: 'https://www.youtube.com/embed/DWELuEoU2OE' },
  { label: 'Урок 2', embedUrl: 'https://www.youtube.com/embed/Um-VOIeE1m4' },
  { label: 'Урок 3', embedUrl: 'https://www.youtube.com/embed/iL7A4mOEaE0' },
  { label: 'Урок 4', embedUrl: 'https://www.youtube.com/embed/HJLP13aqbKc' },
  { label: 'Урок 5', embedUrl: 'https://www.youtube.com/embed/E0IK9fYM3Ow' },
] as const;

type FormatId = 'reels' | 'stories' | 'carousel';

interface FormatButtonState {
  status: 'idle' | 'loading' | 'saved';
}

const FORMAT_LABELS: Record<FormatId, { idle: string; emoji: string }> = {
  reels: { idle: 'Написати рілс', emoji: '✍️' },
  stories: { idle: 'Написати сторіс', emoji: '📱' },
  carousel: { idle: 'Зробити карусель', emoji: '🗂️' },
};

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function initialFormatStates(): Record<FormatId, FormatButtonState> {
  return {
    reels: { status: 'idle' },
    stories: { status: 'idle' },
    carousel: { status: 'idle' },
  };
}

export default function DashboardHome() {
  const router = useRouter();
  const { setBadge } = useNavBadges();
  const { setReelResult } = useRantResults();
  const [rant, setRant] = useState('');
  const [formatStates, setFormatStates] = useState<Record<FormatId, FormatButtonState>>(
    initialFormatStates
  );
  const [formatErrors, setFormatErrors] = useState<Record<FormatId, string | null>>({
    reels: null,
    stories: null,
    carousel: null,
  });
  const rantEpochRef = useRef(0);

  const wordCount = useMemo(() => countWords(rant), [rant]);
  const canUseContentActions = wordCount >= MIN_WORDS_FOR_ACTIONS;

  const handleRantChange = (text: string) => {
    setRant(text);
    rantEpochRef.current += 1;
    setFormatStates(initialFormatStates());
    setFormatErrors({ reels: null, stories: null, carousel: null });
  };

  const runReels = async () => {
    if (!canUseContentActions) return;
    const epoch = rantEpochRef.current;
    const snapshot = rant.trim();
    setFormatErrors((e) => ({ ...e, reels: null }));
    setFormatStates((s) => ({ ...s, reels: { status: 'loading' } }));

    const result = await generateReelFromRant(snapshot);
    if (epoch !== rantEpochRef.current) return;

    if (!result.ok) {
      setFormatStates((s) => ({ ...s, reels: { status: 'idle' } }));
      setFormatErrors((e) => ({
        ...e,
        reels: result.error || 'Помилка генерації — спробуй ще раз',
      }));
      return;
    }

    setReelResult(result.projectId, snapshot);
    setBadge('reels', true);
    setFormatStates((s) => ({ ...s, reels: { status: 'saved' } }));
  };

  const runStories = async () => {
    if (!canUseContentActions) return;
    const epoch = rantEpochRef.current;
    const snapshot = rant.trim();
    setFormatErrors((e) => ({ ...e, stories: null }));
    setFormatStates((s) => ({ ...s, stories: { status: 'loading' } }));

    try {
      const result = await createStorytellingProjectFromRant(snapshot);
      if (epoch !== rantEpochRef.current) return;
      if (!result.ok) {
        setFormatStates((s) => ({ ...s, stories: { status: 'idle' } }));
        setFormatErrors((e) => ({
          ...e,
          stories: result.error || 'Помилка генерації — спробуй ще раз',
        }));
        return;
      }
      setBadge('storytelling', true);
      setFormatStates((s) => ({ ...s, stories: { status: 'saved' } }));
      router.push(`/storytelling/${result.projectId}`);
    } catch {
      if (epoch !== rantEpochRef.current) return;
      setFormatStates((s) => ({ ...s, stories: { status: 'idle' } }));
      setFormatErrors((e) => ({
        ...e,
        stories: 'Помилка генерації — спробуй ще раз',
      }));
    }
  };

  const runCarousel = async () => {
    if (!canUseContentActions) return;
    const epoch = rantEpochRef.current;
    const snapshot = rant.trim();
    setFormatErrors((e) => ({ ...e, carousel: null }));
    setFormatStates((s) => ({ ...s, carousel: { status: 'loading' } }));

    try {
      const res = await fetch('/api/carousel/rant-to-slides', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rant: snapshot }),
      });
      const data = (await res.json()) as CarouselRantOutput & { error?: string };
      if (epoch !== rantEpochRef.current) return;
      if (!res.ok || !data.slides?.length) {
        setFormatStates((s) => ({ ...s, carousel: { status: 'idle' } }));
        const msg =
          typeof data.error === 'string' && data.error.trim()
            ? data.error.trim()
            : 'Помилка генерації — спробуй ще раз';
        setFormatErrors((e) => ({
          ...e,
          carousel: msg,
        }));
        return;
      }
      const createResult = await createCarouselProjectFromRant(data, snapshot);
      if (epoch !== rantEpochRef.current) return;
      if (!createResult.ok) {
        setFormatStates((s) => ({ ...s, carousel: { status: 'idle' } }));
        setFormatErrors((e) => ({
          ...e,
          carousel: 'Не вдалося створити карусель — спробуй ще раз',
        }));
        return;
      }
      setBadge('carousel', true);
      setFormatStates((s) => ({ ...s, carousel: { status: 'saved' } }));
      router.push('/carousel');
    } catch {
      if (epoch !== rantEpochRef.current) return;
      setFormatStates((s) => ({ ...s, carousel: { status: 'idle' } }));
      setFormatErrors((e) => ({
        ...e,
        carousel: 'Помилка генерації — спробуй ще раз',
      }));
    }
  };

  const wordsNeeded = Math.max(0, MIN_WORDS_FOR_ACTIONS - wordCount);

  const primaryBtn =
    'btn-primary w-full rounded-xl px-5 py-3 text-sm font-semibold shadow-md transition-[background,transform,opacity] duration-150 ease-out';
  const primaryOn = `${primaryBtn} cursor-pointer bg-[color:var(--accent)] text-white hover:brightness-110`;
  const primaryLoading = `${primaryBtn} cursor-wait bg-[color:var(--accent)]/70 text-white/90 shadow-none`;
  const primaryOff = `${primaryBtn} cursor-not-allowed bg-zinc-200 text-zinc-500 shadow-none`;

  const secondaryOn =
    'w-full rounded-xl border-2 border-[color:var(--accent)] bg-white px-5 py-3 text-sm font-semibold text-[color:var(--accent)] shadow-sm transition-[background,border-color,transform,opacity] duration-150 ease-out hover:bg-[color:var(--accent-soft)]';
  const secondaryLoading =
    'w-full cursor-wait rounded-xl border-2 border-[color:var(--accent)]/55 bg-white px-5 py-3 text-sm font-semibold text-[color:var(--accent)]/90 shadow-none opacity-80';
  const secondaryOff =
    'w-full cursor-not-allowed rounded-xl border-2 border-zinc-200 bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-500 shadow-none';

  const savedOutline =
    'w-full cursor-default rounded-xl border border-[color:var(--success)] bg-transparent px-5 py-3 text-sm font-semibold text-[color:var(--success)] opacity-80 shadow-none';

  function formatButtonClass(
    id: FormatId,
    variant: 'primary' | 'secondary'
  ): string {
    const st = formatStates[id].status;
    if (st === 'saved') return savedOutline;
    if (st === 'loading') {
      return variant === 'primary' ? primaryLoading : secondaryLoading;
    }
    if (!canUseContentActions) {
      return variant === 'primary' ? primaryOff : secondaryOff;
    }
    return variant === 'primary' ? primaryOn : secondaryOn;
  }

  const handlers: Record<FormatId, () => void> = {
    reels: runReels,
    stories: runStories,
    carousel: runCarousel,
  };

  function isFormatDisabled(id: FormatId): boolean {
    const st = formatStates[id].status;
    if (!canUseContentActions) return true;
    return st === 'loading' || st === 'saved';
  }

  return (
    <>
      <Suspense fallback={null}>
        <WelcomeModal />
      </Suspense>
      <div className="mx-auto max-w-5xl space-y-6 pb-20">
      <div className="space-y-6 pt-2">
        <h1 className="font-display text-center text-2xl font-bold tracking-tight text-black sm:text-3xl">
          Виплесни всі свої думки
        </h1>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-8">
          <div className="order-2 flex w-full flex-col gap-3 lg:order-2 lg:w-72 lg:shrink-0 lg:pt-1">
            {(['reels', 'stories', 'carousel'] as const).map((id) => {
              const st = formatStates[id].status;
              const err = formatErrors[id];
              const label = FORMAT_LABELS[id];
              const variant = id === 'reels' ? 'primary' : 'secondary';

              return (
                <span key={id} className="relative block w-full">
                  <button
                    type="button"
                    onClick={() => void handlers[id]()}
                    disabled={isFormatDisabled(id)}
                    className={`relative z-0 ${formatButtonClass(id, variant)}`}
                  >
                    {st === 'loading' ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Генеруємо...
                      </span>
                    ) : st === 'saved' ? (
                      <span className="inline-flex items-center justify-center gap-1.5">✓ Збережено</span>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <span aria-hidden>{label.emoji}</span>
                        {label.idle}
                      </span>
                    )}
                  </button>
                  {!canUseContentActions && st === 'idle' && (
                    <span
                      className="absolute inset-0 z-10 cursor-help rounded-xl"
                      title={DISABLED_CONTENT_ACTION_TOOLTIP}
                      aria-hidden
                    />
                  )}
                  {err && (
                    <p className="mt-1.5 text-left text-xs leading-normal text-red-700">{err}</p>
                  )}
                </span>
              );
            })}
          </div>

          <div className="order-1 min-w-0 flex-1 lg:order-1">
            <RantInput value={rant} onChange={handleRantChange} placeholder="Про що будемо розповідати сьогодні?" />
            <p className="mt-2 text-left text-xs leading-normal text-zinc-600">
              {canUseContentActions
                ? `У тексті ${wordCount} ${wordLabel(wordCount)} — можна згенерувати рілс, сторіс і карусель.`
                : `Мінімум ${MIN_WORDS_FOR_ACTIONS} слів, щоб увімкнути кнопки. Зараз: ${wordCount}. Залишилось: ${wordsNeeded}.`}
            </p>
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

      <section className="mt-10 space-y-4">
        <h2 className="font-display text-lg font-semibold text-black">Воркшоп з ШІ-контенту</h2>
        <h3 className="text-sm font-medium text-zinc-700">Модуль 1: де брати ідеї та воронка контенту</h3>
        <div className="space-y-4">
          {WORKSHOP_LESSONS.map((lesson) => (
            <article
              key={lesson.label}
              className="card-shadow rounded-2xl border border-[color:var(--border)] bg-white p-4"
            >
              <p className="mb-3 text-sm font-semibold text-black">{lesson.label}</p>
              <iframe
                src={lesson.embedUrl}
                title={lesson.label}
                className="aspect-video w-full rounded-xl border border-[color:var(--border)]"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </article>
          ))}
        </div>
      </section>

    </div>
    </>
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
