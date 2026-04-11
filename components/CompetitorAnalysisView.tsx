'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { IdeaScanRow, IdeaTopReelItem } from '@/lib/ideaScanTypes';
import {
  getIdeaScanById,
  listIdeaScansForUser,
  pollCompetitorScan,
  refetchReelVideoUrl,
  startCompetitorScan,
  updateIdeaScanSavedReels,
} from '@/app/competitor-analysis-actions';

type Screen = 'home' | 'scanning' | 'results';

interface RecentEntry {
  id: string;
  handle: string;
  initial: string;
  followersLabel: string;
  avgViews: string;
  avgEr: string;
  dateLabel: string;
  savedCount: number;
}

/** Row shown in results / detail panel (mapped from `IdeaTopReelItem`). */
interface DisplayReel {
  rank: number;
  shortCode: string;
  url: string;
  videoUrl: string;
  hook: string;
  templatePattern: string;
  templateBody: string;
  videoViewCount: number;
  likesCount: number;
  commentsCount: number;
  erPercent: number;
  multiplier: number;
  isViral: boolean;
}

const SCAN_STEP_MESSAGES = [
  'Завантажуємо рілси...',
  'Аналізуємо метрики...',
  'Порівнюємо з середнім...',
  'Обираємо топ 10...',
  'Готуємо шаблони...',
];

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 100;

function mapTopItemsToDisplayReels(items: IdeaTopReelItem[]): DisplayReel[] {
  return items.map((item) => ({
    rank: item.rank,
    shortCode: item.shortCode,
    url: item.url,
    videoUrl: item.videoUrl,
    hook: item.hook,
    templatePattern: item.templatePattern,
    templateBody: item.templateLines.join('\n'),
    videoViewCount: item.videoViewCount,
    likesCount: item.likesCount,
    commentsCount: item.commentsCount,
    erPercent: item.erPercent,
    multiplier: item.viralScore,
    isViral: item.isViral,
  }));
}

function normalizeInstagramInput(raw: string): string {
  let v = raw.trim();
  v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  const segment = v.split(/[/?#]/)[0] ?? '';
  const username = segment.replace(/^@+/, '').replace(/\/+$/, '');
  if (!username) return '@profile';
  return `@${username.toLowerCase()}`;
}

function avatarLetter(handle: string): string {
  const u = handle.replace(/^@+/, '');
  return u ? u[0]!.toUpperCase() : '?';
}

function fmtEr(p: number): string {
  return `${p.toFixed(1)}%`;
}

function fmtLikeRate(likesCount: number, videoViewCount: number): string {
  if (videoViewCount <= 0 || likesCount < 0) return '—';
  return `${((likesCount / videoViewCount) * 100).toFixed(1)}%`;
}

function formatCompactCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? Math.round(v) : Number(v.toFixed(1))}M`.replace('.0M', 'M');
  }
  if (abs >= 1000) {
    const v = n / 1000;
    return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}K`.replace('.0K', 'K');
  }
  return String(Math.round(n));
}

function followersShortFromLabel(label: string): string {
  return label.replace(/\s*підп\.?\s*$/i, '').trim();
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 17 17 7m0 0H9m8 0v8"
      />
    </svg>
  );
}

/** Eye — views / перегляди */
function ViewsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 5 12 5c4.638 0 8.573 2.51 9.963 6.683.071.204.071.431 0 .639C20.577 16.49 16.64 19 12 19c-4.638 0-8.573-2.51-9.963-6.683Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

/** Heart — likes / лайки */
function LikesIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
      />
    </svg>
  );
}

function TemplateBody({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean);
  return (
    <div className="space-y-1">
      {lines.map((line, li) => (
        <p
          key={li}
          className="text-[13px] leading-[1.5] text-[var(--color-text-secondary)]"
        >
          {line.split(/(\[[^\]]+\])/g).map((part, i) => {
            if (/^\[[^\]]+\]$/.test(part)) {
              const inner = part.slice(1, -1);
              return (
                <span
                  key={i}
                  className="mx-0.5 inline rounded border-[0.5px] border-[var(--color-border-primary)] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-primary)]"
                >
                  {inner}
                </span>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

export default function CompetitorAnalysisView() {
  const [screen, setScreen] = useState<Screen>('home');
  const [searchInput, setSearchInput] = useState('');
  const [currentHandle, setCurrentHandle] = useState('');
  const [currentScan, setCurrentScan] = useState<IdeaScanRow | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [savedShortCodes, setSavedShortCodes] = useState<string[]>([]);
  const [refetching, setRefetching] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [reelItems, setReelItems] = useState<DisplayReel[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [recentsLoading, setRecentsLoading] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scanCancelledRef = useRef(false);

  const viralThresholdCount = currentScan?.top_reels.summary.qualifiedCount ?? 0;

  const profileMeta = useMemo(() => {
    if (!currentScan) {
      return {
        followersLabel: '—',
        avgViews: '—',
        avgEr: '—',
        reelsAnalyzed: 0,
      };
    }
    const s = currentScan.top_reels.summary;
    return {
      followersLabel: `${formatCompactCount(currentScan.followers_count)} підп.`,
      avgViews: s.avgViewsDisplay,
      avgEr: s.avgErDisplay,
      reelsAnalyzed: s.reelsAnalyzed,
    };
  }, [currentScan]);

  const loadRecents = useCallback(async () => {
    setRecentsLoading(true);
    setHomeError(null);
    try {
      const list = await listIdeaScansForUser();
      setRecentEntries(
        list.map((row) => ({
          id: row.id,
          handle: row.handle,
          initial: avatarLetter(row.handle),
          followersLabel: `${formatCompactCount(row.followers_count)} підп.`,
          avgViews: row.avgViewsDisplay ?? '—',
          avgEr: row.avgErDisplay ?? '—',
          dateLabel: new Date(row.scanned_at).toLocaleDateString('uk-UA', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
          savedCount: row.saved_reel_ids?.length ?? 0,
        }))
      );
    } catch {
      setHomeError('Не вдалося завантажити недавні сканування.');
    } finally {
      setRecentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecents();
  }, [loadRecents]);

  const applyScanAndShowResults = useCallback((scan: IdeaScanRow) => {
    setCurrentScan(scan);
    setCurrentHandle(scan.handle);
    setReelItems(mapTopItemsToDisplayReels(scan.top_reels.items));
    setSavedShortCodes([...(scan.saved_reel_ids ?? [])]);
    setActiveIdx(null);
    setVideoFailed(false);
    setRefetching(false);
    setSaveError(null);
    setScreen('results');
  }, []);

  const scanStepIndex = useMemo(() => {
    if (screen !== 'scanning') return 0;
    return Math.min(
      SCAN_STEP_MESSAGES.length - 1,
      Math.floor((scanProgress / 100) * SCAN_STEP_MESSAGES.length)
    );
  }, [screen, scanProgress]);

  const onSearchSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchInput.trim()) return;
      setScanError(null);
      setHomeError(null);
      scanCancelledRef.current = false;
      setScanProgress(0);
      setScreen('scanning');
      const h = normalizeInstagramInput(searchInput);
      setCurrentHandle(h);

      try {
        const start = await startCompetitorScan(searchInput);
        if (scanCancelledRef.current) return;
        if (!start.ok) {
          setScanError(start.error);
          setScreen('home');
          return;
        }
        if (start.kind === 'cached') {
          setScanProgress(100);
          applyScanAndShowResults(start.scan);
          void loadRecents();
          return;
        }

        const { runId, handle } = start;

        for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
          if (scanCancelledRef.current) return;
          const polled = await pollCompetitorScan(runId, handle);
          if (scanCancelledRef.current) return;
          if (!polled.ok) {
            setScanError(polled.error);
            setScreen('home');
            return;
          }
          if (polled.kind === 'ready') {
            setScanProgress(100);
            applyScanAndShowResults(polled.scan);
            void loadRecents();
            return;
          }
          setScanProgress(Math.min(92, ((i + 1) / MAX_POLL_ATTEMPTS) * 92));
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
        setScanError('Час очікування сканування вичерпано. Спробуй ще раз.');
        setScreen('home');
      } catch (err) {
        if (scanCancelledRef.current) return;
        setScanError(err instanceof Error ? err.message : 'Помилка сканування.');
        setScreen('home');
      }
    },
    [searchInput, applyScanAndShowResults, loadRecents]
  );

  const onRecentClick = useCallback(
    async (entry: RecentEntry) => {
      setHomeError(null);
      setScanError(null);
      setSaveError(null);
      const scan = await getIdeaScanById(entry.id);
      if (!scan) {
        setHomeError('Сканування не знайдено. Онови список або запусти нове.');
        void loadRecents();
        return;
      }
      applyScanAndShowResults(scan);
    },
    [applyScanAndShowResults, loadRecents]
  );

  const backToHome = useCallback(() => {
    scanCancelledRef.current = true;
    setScreen('home');
    setScanProgress(0);
    setCurrentScan(null);
    void loadRecents();
  }, [loadRecents]);

  const onReelCardClick = useCallback((index: number) => {
    setActiveIdx((prev) => (prev === index ? null : index));
  }, []);

  const updateReelVideoUrl = useCallback((shortCode: string, videoUrl: string) => {
    setReelItems((prev) =>
      prev.map((r) => (r.shortCode === shortCode ? { ...r, videoUrl } : r))
    );
  }, []);

  const refetchVideoForReel = useCallback(
    async (shortCode: string) => {
      setRefetching(true);
      setVideoFailed(false);
      try {
        const fresh = await refetchReelVideoUrl(shortCode);
        if (fresh.ok) {
          updateReelVideoUrl(shortCode, fresh.videoUrl);
        } else {
          setVideoFailed(true);
        }
      } catch {
        setVideoFailed(true);
      } finally {
        setRefetching(false);
      }
    },
    [updateReelVideoUrl]
  );

  useEffect(() => {
    setVideoFailed(false);
  }, [activeIdx]);

  const selectedReel =
    activeIdx !== null ? (reelItems[activeIdx] ?? null) : null;

  const onSaveTemplate = useCallback(
    async (reel: DisplayReel) => {
      if (!currentScan?.id) return;
      if (savedShortCodes.includes(reel.shortCode)) return;
      setSaveError(null);
      const next = [...savedShortCodes, reel.shortCode];
      const res = await updateIdeaScanSavedReels(currentScan.id, next);
      if (!res.ok) {
        setSaveError(res.error ?? 'Не вдалося зберегти.');
        return;
      }
      setSavedShortCodes(next);
      setCurrentScan((prev) => (prev ? { ...prev, saved_reel_ids: next } : prev));
      void loadRecents();
    },
    [currentScan?.id, savedShortCodes, loadRecents]
  );

  const resultsUpdatedLabel = useMemo(() => {
    if (!currentScan?.scanned_at) return '—';
    return new Date(currentScan.scanned_at).toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [currentScan?.scanned_at]);

  const displayHandlePlain = currentHandle.replace(/^@/, '');

  const likesDisplay = (n: number) =>
    n < 0 ? '—' : formatCompactCount(n);

  return (
    <div className="-mx-8 -my-8 flex min-h-0 flex-1 flex-col bg-white p-6 sm:p-8">
      {screen === 'home' && (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <div
            className="rounded-[var(--border-radius-xl)] bg-white p-5 sm:p-6"
            style={{ boxShadow: 'var(--shadow-card-sm)' }}
          >
            <form
              className="flex w-full flex-col items-stretch gap-3 sm:flex-row"
              onSubmit={onSearchSubmit}
            >
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="@username або посилання на профіль"
                className="min-w-0 flex-1 rounded-[var(--border-radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-background-secondary)] px-4 py-3 text-sm text-[var(--color-text-primary)] transition-shadow placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-link)] focus:bg-white focus:ring-2 focus:ring-[var(--color-link-soft)]"
              />
              <button
                type="submit"
                disabled={!searchInput.trim()}
                className="shrink-0 cursor-pointer rounded-[var(--border-radius-lg)] bg-[#004BA8] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d5bb8] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Сканувати
              </button>
            </form>
            {scanError && (
              <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {scanError}
              </div>
            )}
          </div>

          <section>
            <h2 className="text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
              Нещодавні
            </h2>
            {homeError && (
              <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {homeError}
              </div>
            )}
            <div
              className="mt-3 overflow-hidden rounded-[var(--border-radius-xl)] bg-white"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="overflow-x-auto">
                <div className="min-w-[720px]">
                  <div
                    className="grid grid-cols-[40px_minmax(220px,1fr)_104px_96px_72px_36px] items-center gap-3 border-b border-[var(--color-border-primary)] bg-[var(--color-background-secondary)] px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
                  >
                    <span aria-hidden className="block w-10" />
                    <span>Instagram акаунт</span>
                    <span className="text-right">Підписники</span>
                    <span className="text-right">Сер. перегл.</span>
                    <span className="text-right">ER</span>
                    <span />
                  </div>
                  {recentsLoading ? (
                    <p className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
                      Завантаження…
                    </p>
                  ) : recentEntries.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
                      Ще немає сканувань. Введи @username або посилання на профіль і натисни «Сканувати».
                    </p>
                  ) : (
                    <ul>
                      {recentEntries.map((entry) => (
                        <li key={entry.id} className="border-b border-[var(--color-border-primary)] last:border-b-0">
                          <button
                            type="button"
                            onClick={() => void onRecentClick(entry)}
                            className="grid w-full cursor-pointer grid-cols-[40px_minmax(220px,1fr)_104px_96px_72px_36px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#fafbfd]"
                          >
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#eef1f8] to-[#dfe4f2] text-sm font-semibold text-[var(--color-text-primary)]"
                              style={{
                                boxShadow:
                                  '0 0 0 2px #fff, 0 0 0 4px rgba(34, 197, 94, 0.28)',
                              }}
                            >
                              {entry.initial}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                                {entry.handle}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--color-text-muted)]">
                                <span>{entry.dateLabel}</span>
                                <span>·</span>
                                <span>{entry.followersLabel}</span>
                                {entry.savedCount > 0 && (
                                  <span className="rounded-md border border-[var(--color-border-primary)] bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
                                    {entry.savedCount} збережено
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-right text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                              {followersShortFromLabel(entry.followersLabel)}
                            </span>
                            <span className="text-right text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                              {entry.avgViews}
                            </span>
                            <span className="text-right text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                              {entry.avgEr}
                            </span>
                            <span className="flex justify-end text-[var(--color-text-muted)]">
                              <ExternalLinkIcon className="h-4 w-4" />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {screen === 'scanning' && (
        <div className="flex min-h-[calc(100dvh-7rem)] flex-1 items-center justify-center px-4">
          <div
            className="w-full max-w-md rounded-[var(--border-radius-xl)] bg-white px-8 py-10 text-center"
            style={{ boxShadow: 'var(--shadow-card-sm)' }}
          >
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">
              {currentHandle}
            </p>
            <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">
              Скануємо профіль і аналізуємо рілси…
            </p>
            <div className="mx-auto mt-8 w-[300px] max-w-full">
              <div className="h-[3px] overflow-hidden rounded-full bg-[var(--color-background-secondary)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#004BA8] to-[#0d5bb8] transition-[width] duration-75 ease-linear"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>
            <p className="mt-4 text-[13px] text-[var(--color-text-muted)]">
              {SCAN_STEP_MESSAGES[scanStepIndex]}
            </p>
          </div>
        </div>
      )}

      {screen === 'results' && currentScan && (
        <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-6xl flex-1 flex-col overflow-hidden">
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--border-radius-2xl)] bg-white"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <header className="shrink-0 border-b border-[var(--color-border-primary)] px-6 pb-6 pt-5">
              <button
                type="button"
                onClick={backToHome}
                className="inline cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-semibold text-[var(--color-text-primary)] underline-offset-4 transition-colors hover:text-[var(--color-text-muted)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-primary)]"
              >
                ← Назад
              </button>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
                  Аналіз профілю
                </h1>
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[var(--color-border-primary)] px-1 text-[10px] font-bold text-[var(--color-text-muted)]"
                  title="Довідка"
                >
                  i
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Оновлено {resultsUpdatedLabel}
              </p>
              <div className="mt-6 flex flex-wrap items-end justify-between gap-6 border-t border-[var(--color-border-primary)] pt-6">
                <div className="flex min-w-0 items-start gap-4">
                  <div
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#eef1f8] to-[#dfe4f2] text-lg font-bold text-[var(--color-text-primary)]"
                    style={{
                      boxShadow:
                        '0 0 0 3px #fff, 0 0 0 6px rgba(34, 197, 94, 0.28)',
                    }}
                  >
                    {avatarLetter(currentHandle)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-[var(--color-text-primary)]">
                      {displayHandlePlain}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-medium text-[var(--color-link)]">
                      {currentHandle.startsWith('@') ? currentHandle : `@${currentHandle}`}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                      {profileMeta.followersLabel} · {profileMeta.reelsAnalyzed} рілсів
                      проаналізовано
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-10">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      Сер. перегляди
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
                      {profileMeta.avgViews}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      Сер. ER
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
                      {profileMeta.avgEr}
                    </p>
                  </div>
                </div>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--color-background-secondary)]">
              <div
                className="flex min-h-0 flex-col border-r border-[var(--color-border-primary)] bg-[var(--color-background-secondary)]"
                style={{ flex: '0 0 40%', maxWidth: '40%', minWidth: 0 }}
              >
                <div className="shrink-0 border-b border-[var(--color-border-primary)] bg-white/80 px-3 py-2.5 text-[12px] text-[var(--color-text-muted)] backdrop-blur-sm">
                  {reelItems.length} топ рілсів · {viralThresholdCount} перевищують
                  поріг
                </div>
                {reelItems.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--color-text-muted)]">
                    Немає рілсів з переглядами для цього профілю. Спробуй інший акаунт або
                    перевір, що профіль публічний.
                  </div>
                ) : (
                  <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                    {reelItems.map((reel, index) => {
                      const active = activeIdx === index;
                      return (
                        <li key={reel.shortCode}>
                          <button
                            type="button"
                            onClick={() => onReelCardClick(index)}
                            className={`w-full cursor-pointer border-l-2 text-left shadow-sm transition-colors ${
                              active
                                ? 'border-[var(--color-text-primary)] bg-white'
                                : 'border-transparent bg-white hover:bg-[#fafbfd]'
                            }`}
                            style={{
                              padding: '10px 12px',
                              borderRadius: active
                                ? '0 var(--border-radius-lg) var(--border-radius-lg) 0'
                                : 'var(--border-radius-lg)',
                              boxShadow: active
                                ? 'var(--shadow-card-sm)'
                                : '0 1px 2px rgba(26, 28, 46, 0.04)',
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-[var(--color-text-muted)]">
                                #{reel.rank}
                              </span>
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={
                                  reel.isViral
                                    ? {
                                        background: '#EAF3DE',
                                        color: '#3B6D11',
                                      }
                                    : {
                                        background: '#FAEEDA',
                                        color: '#633806',
                                      }
                                }
                              >
                                {reel.isViral ? 'Вірусний' : 'Топ профілю'}
                              </span>
                              <span className="text-[10px] text-[var(--color-text-muted)]">
                                {reel.multiplier.toFixed(1)}×
                              </span>
                            </div>
                            <p
                              className="mt-2 text-[13px] font-medium leading-snug text-[var(--color-text-primary)]"
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {reel.hook}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-text-muted)]">
                              <span className="inline-flex items-center gap-0.5 tabular-nums">
                                <ViewsIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                {formatCompactCount(reel.videoViewCount)}
                              </span>
                              <span aria-hidden className="text-[var(--color-border-primary)]">
                                ·
                              </span>
                              <span className="inline-flex items-center gap-0.5 tabular-nums">
                                <LikesIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                {likesDisplay(reel.likesCount)}
                              </span>
                              <span aria-hidden className="text-[var(--color-border-primary)]">
                                ·
                              </span>
                              <span>
                                LR {fmtLikeRate(reel.likesCount, reel.videoViewCount)}
                              </span>
                              <span aria-hidden className="text-[var(--color-border-primary)]">
                                ·
                              </span>
                              <span>ER {fmtEr(reel.erPercent)}</span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div
                className="flex min-h-0 flex-col bg-white"
                style={{ flex: '0 0 60%', maxWidth: '60%', minWidth: 0 }}
              >
                {!selectedReel ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-background-secondary)] text-[var(--color-text-muted)]"
                      style={{ width: 40, height: 40 }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="ml-0.5"
                        aria-hidden
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                    <p className="text-[13px] text-[var(--color-text-muted)]">
                      {reelItems.length === 0
                        ? 'Немає рілсів для перегляду'
                        : 'Обери рілс щоб переглянути деталі'}
                    </p>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                      <div
                        className="shrink-0"
                        style={{ padding: '16px 20px 0' }}
                      >
                        <div className="mx-auto w-1/2 min-w-[120px] max-w-[240px]">
                          <div
                            className="relative overflow-hidden bg-black"
                            style={{
                              borderRadius: 'var(--border-radius-lg)',
                              /** 1080×1920 / Reels & TikTok vertical */
                              aspectRatio: '9 / 16',
                            }}
                          >
                            {videoFailed ? (
                              <div className="flex h-full w-full items-center justify-center text-[13px] text-[var(--color-text-muted)]">
                                Відео недоступне
                              </div>
                            ) : (
                              <video
                                key={selectedReel.videoUrl}
                                src={selectedReel.videoUrl}
                                controls
                                className="h-full w-full object-cover object-center"
                                style={{
                                  background: '#000',
                                }}
                                onError={() =>
                                  void refetchVideoForReel(selectedReel.shortCode)
                                }
                              />
                            )}
                            {refetching && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                              </div>
                            )}
                          </div>
                        </div>
                        <a
                          href={selectedReel.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-block text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline"
                        >
                          Відкрити в Instagram →
                        </a>
                      </div>

                      <section
                        className="shrink-0 border-b border-[var(--color-border-primary)]"
                        style={{ padding: '12px 20px' }}
                      >
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                          СТАТИСТИКА
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {(
                            [
                              ['Перегляди', formatCompactCount(selectedReel.videoViewCount)],
                              ['Лайки', likesDisplay(selectedReel.likesCount)],
                              [
                                'Like rate',
                                fmtLikeRate(
                                  selectedReel.likesCount,
                                  selectedReel.videoViewCount
                                ),
                              ],
                              [
                                'Коментарі',
                                formatCompactCount(selectedReel.commentsCount),
                              ],
                            ] as const
                          ).map(([label, val]) => (
                            <div
                              key={label}
                              className="rounded-[var(--border-radius-md)] bg-[var(--color-background-secondary)]"
                              style={{ padding: '8px 10px' }}
                            >
                              <p className="text-[11px] text-[var(--color-text-muted)]">
                                {label}
                              </p>
                              <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
                                {val}
                              </p>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="shrink-0" style={{ padding: '12px 20px' }}>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                          ШАБЛОН
                        </p>
                        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                          Паттерн: {selectedReel.templatePattern}
                        </p>
                        <div className="mt-3">
                          <TemplateBody text={selectedReel.templateBody} />
                        </div>
                      </section>

                      <div
                        className="shrink-0 border-t border-[var(--color-border-primary)] bg-white"
                        style={{ padding: '12px 20px 20px' }}
                      >
                        {saveError && (
                          <p className="mb-2 text-center text-xs text-red-600">{saveError}</p>
                        )}
                        {savedShortCodes.includes(selectedReel.shortCode) ? (
                          <button
                            type="button"
                            disabled
                            className="w-full cursor-not-allowed rounded-[var(--border-radius-lg)] bg-[var(--color-background-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]"
                          >
                            Збережено ✓
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void onSaveTemplate(selectedReel)}
                            className="w-full cursor-pointer rounded-[var(--border-radius-lg)] bg-gradient-to-r from-[#004BA8] to-[#0d5bb8] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-[#0d5bb8] hover:to-[#1565c0]"
                          >
                            Зберегти в рілси
                          </button>
                        )}
                      </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
