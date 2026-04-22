'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Eye, Heart, MessageCircle } from 'lucide-react';
import {
  parseIdeaScanReelStringMap,
  type IdeaScanRow,
  type IdeaTopReelItem,
} from '@/lib/ideaScanTypes';
import {
  getIdeaScanById,
  listIdeaScansForUser,
  pollCompetitorScan,
  refetchReelVideoUrl,
  startCompetitorScan,
  transcribeCompetitorReelVideo,
} from '@/app/competitor-analysis-actions';
import { saveCompetitorReelToScenario } from '@/app/actions';

type Screen = 'home' | 'scanning' | 'results';

interface RecentEntry {
  id: string;
  handle: string;
  initial: string;
  followersLabel: string;
  avgPlays: string;
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
  plays: number;
  likesCount: number;
  commentsCount: number;
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
const MAX_REEL_NOTE_CHARS = 500;

function mapTopItemsToDisplayReels(items: IdeaTopReelItem[]): DisplayReel[] {
  return items.map((item) => ({
    rank: item.rank,
    shortCode: item.shortCode,
    url: item.url,
    videoUrl: item.videoUrl,
    hook: item.hook,
    templatePattern: item.templatePattern,
    templateBody: item.templateLines.join('\n'),
    // Backward-compat for cached rows produced before `plays` key rename.
    plays:
      item.plays ??
      (item as unknown as { videoPlayCount?: number }).videoPlayCount ??
      0,
    likesCount: item.likesCount,
    commentsCount: item.commentsCount,
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
  const [saveBusy, setSaveBusy] = useState(false);
  const transcriptCacheRef = useRef<Record<string, string>>({});
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState<string | null>(null);
  const [reelPanelNote, setReelPanelNote] = useState('');
  const scanCancelledRef = useRef(false);

  const viralThresholdCount = currentScan?.top_reels.summary.qualifiedCount ?? 0;

  const profileMeta = useMemo(() => {
    if (!currentScan) {
      return {
        followersLabel: '—',
        avgPlays: '—',
        reelsAnalyzed: 0,
      };
    }
    const s = currentScan.top_reels.summary;
    return {
      followersLabel: `${formatCompactCount(currentScan.followers_count)} підп.`,
      avgPlays: s.avgPlaysDisplay,
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
          avgPlays: row.avgPlaysDisplay ?? '—',
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
    transcriptCacheRef.current = {};
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

  const savedNotesByShortCode = useMemo(
    () => parseIdeaScanReelStringMap(currentScan?.user_note),
    [currentScan?.user_note]
  );

  const savedTranscriptsByShortCode = useMemo(
    () => parseIdeaScanReelStringMap(currentScan?.reel_transcripts),
    [currentScan?.reel_transcripts]
  );

  useEffect(() => {
    if (!selectedReel) {
      setReelPanelNote('');
      return;
    }
    setReelPanelNote(savedNotesByShortCode[selectedReel.shortCode] ?? '');
  }, [selectedReel?.shortCode, savedNotesByShortCode]);

  useEffect(() => {
    if (!selectedReel) {
      setTranscriptText(null);
      setTranscriptError(null);
      setTranscriptLoading(false);
      return;
    }

    const code = selectedReel.shortCode;
    const stored = savedTranscriptsByShortCode[code]?.trim();
    if (stored) {
      setTranscriptText(stored);
      setTranscriptError(null);
      setTranscriptLoading(false);
      transcriptCacheRef.current[code] = stored;
      return;
    }

    const mem = transcriptCacheRef.current[code];
    if (mem !== undefined) {
      setTranscriptText(mem);
      setTranscriptError(null);
      setTranscriptLoading(false);
      return;
    }

    const url = selectedReel.videoUrl.trim();
    if (!url) {
      setTranscriptText(null);
      setTranscriptError('Немає посилання на відео для транскрипції.');
      setTranscriptLoading(false);
      return;
    }

    const scanId = currentScan?.id;
    let cancelled = false;
    setTranscriptLoading(true);
    setTranscriptError(null);
    setTranscriptText(null);
    void transcribeCompetitorReelVideo(
      url,
      scanId ? { scanId, shortCode: code } : undefined
    ).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        transcriptCacheRef.current[code] = res.transcript;
        setTranscriptText(res.transcript);
        setTranscriptError(null);
        if (scanId) {
          setCurrentScan((prev) => {
            if (!prev || prev.id !== scanId) return prev;
            return {
              ...prev,
              reel_transcripts: {
                ...parseIdeaScanReelStringMap(prev.reel_transcripts),
                [code]: res.transcript,
              },
            };
          });
        }
      } else {
        setTranscriptError(res.error);
        setTranscriptText(null);
      }
      setTranscriptLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    selectedReel,
    selectedReel?.shortCode,
    selectedReel?.videoUrl,
    savedTranscriptsByShortCode,
    currentScan?.id,
  ]);

  const onSaveTemplate = useCallback(
    async (reel: DisplayReel) => {
      if (!currentScan?.id) return;
      if (savedShortCodes.includes(reel.shortCode)) return;
      setSaveError(null);
      setSaveBusy(true);
      try {
        const res = await saveCompetitorReelToScenario(currentScan.id, {
          shortCode: reel.shortCode,
          videoUrl: reel.videoUrl,
          url: reel.url,
          userNote: reelPanelNote,
        });
        if (!res.ok) {
          setSaveError(res.error);
          return;
        }
        const next = [...savedShortCodes, reel.shortCode];
        setSavedShortCodes(next);
        setCurrentScan((prev) =>
          prev
            ? {
                ...prev,
                saved_reel_ids: next,
                user_note: res.user_note,
                reference_url: res.reference_url,
              }
            : prev
        );
        void loadRecents();
      } finally {
        setSaveBusy(false);
      }
    },
    [currentScan?.id, savedShortCodes, loadRecents, reelPanelNote]
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
                className="btn-primary shrink-0 cursor-pointer rounded-[var(--border-radius-lg)] bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-[background,transform] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Сканувати
              </button>
            </form>
            {scanError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-normal text-red-800">
                {scanError}
              </div>
            )}
          </div>

          <section>
            <h2 className="text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
              Нещодавні
            </h2>
            {homeError && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-normal text-red-800">
                {homeError}
              </div>
            )}
            <div
              className="mt-3 overflow-hidden rounded-[var(--border-radius-xl)] bg-white"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="overflow-x-auto">
                <div className="min-w-[560px] sm:min-w-[720px]">
                  <div
                    className="grid grid-cols-[36px_minmax(140px,1fr)_88px_84px_28px] items-center gap-2 border-b border-[var(--color-border-primary)] bg-[var(--color-background-secondary)] px-3 py-3 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)] sm:grid-cols-[40px_minmax(220px,1fr)_104px_96px_36px] sm:gap-3 sm:px-5 sm:text-[11px]"
                  >
                    <span aria-hidden className="block w-9 sm:w-10" />
                    <span className="whitespace-nowrap">Instagram акаунт</span>
                    <span className="whitespace-nowrap text-right">Підписники</span>
                    <span className="whitespace-nowrap text-right">Сер. відтв.</span>
                    <span />
                  </div>
                  {recentsLoading ? (
                    <div className="space-y-0 px-5 py-6">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={`recent-sk-${i}`}
                          className="border-b border-[var(--color-border-primary)] py-4 last:border-b-0"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--color-background-secondary)]">
                              <div className="reels-planner-skeleton-shimmer h-full w-full rounded-full opacity-80" />
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="relative h-4 w-40 overflow-hidden rounded bg-[var(--color-background-secondary)]">
                                <div className="reels-planner-skeleton-shimmer absolute inset-0 opacity-90" />
                              </div>
                              <div className="relative h-3 w-28 overflow-hidden rounded bg-[var(--color-background-secondary)]">
                                <div className="reels-planner-skeleton-shimmer absolute inset-0 opacity-90" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : recentEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-background-secondary)] text-[var(--color-text-muted)]">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      </div>
                      <p className="max-w-sm text-sm leading-normal text-[var(--color-text-muted)]">
                        Тут поки що нічого немає. Введи @username або посилання на профіль і натисни «Сканувати».
                      </p>
                    </div>
                  ) : (
                    <ul>
                      {recentEntries.map((entry) => (
                        <li key={entry.id} className="border-b border-[var(--color-border-primary)] last:border-b-0">
                          <button
                            type="button"
                            onClick={() => void onRecentClick(entry)}
                            className="grid w-full cursor-pointer grid-cols-[36px_minmax(140px,1fr)_88px_84px_28px] items-center gap-2 px-3 py-3.5 text-left transition-colors hover:bg-[#fafbfd] sm:grid-cols-[40px_minmax(220px,1fr)_104px_96px_36px] sm:gap-3 sm:px-5"
                          >
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#eef1f8] to-[#dfe4f2] text-xs font-semibold text-[var(--color-text-primary)] sm:h-10 sm:w-10 sm:text-sm"
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
                            <span className="text-right text-xs font-semibold tabular-nums text-[var(--color-text-primary)] sm:text-sm">
                              {followersShortFromLabel(entry.followersLabel)}
                            </span>
                            <span className="text-right text-xs font-semibold tabular-nums text-[var(--color-text-primary)] sm:text-sm">
                              {entry.avgPlays}
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
                <h1 className="font-display text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
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
                      Сер. відтворення
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
                      {profileMeta.avgPlays}
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
                    Немає рілсів із відтвореннями для цього профілю. Спробуй інший акаунт або
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
                            className={`w-full cursor-pointer border-l-[3px] text-left shadow-sm transition-colors ${
                              active
                                ? 'border-[color:var(--accent)] bg-white'
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
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-text-muted)]">
                              <span className="inline-flex items-center gap-0.5 tabular-nums">
                                <Eye className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                {formatCompactCount(reel.plays)}
                              </span>
                              <span className="inline-flex items-center gap-0.5 tabular-nums">
                                <Heart className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                {likesDisplay(reel.likesCount)}
                              </span>
                              <span className="inline-flex items-center gap-0.5 tabular-nums">
                                <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                {formatCompactCount(reel.commentsCount)}
                              </span>
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
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] tabular-nums text-[var(--color-text-primary)]">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Eye className="h-4 w-4 shrink-0 text-[var(--color-text-muted)] opacity-80" aria-hidden />
                            <span className="font-medium">{formatCompactCount(selectedReel.plays)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Heart className="h-4 w-4 shrink-0 text-[var(--color-text-muted)] opacity-80" aria-hidden />
                            <span className="font-medium">{likesDisplay(selectedReel.likesCount)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <MessageCircle className="h-4 w-4 shrink-0 text-[var(--color-text-muted)] opacity-80" aria-hidden />
                            <span className="font-medium">{formatCompactCount(selectedReel.commentsCount)}</span>
                          </span>
                        </div>
                      </section>

                      <section className="shrink-0" style={{ padding: '12px 20px' }}>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                          ТРАНСКРИПТ
                        </p>
                        {transcriptLoading ? (
                          <div className="mt-3 flex items-center gap-2 text-[13px] text-[var(--color-text-muted)]">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border-primary)] border-t-[#004BA8]" />
                            Розпізнаємо мову…
                          </div>
                        ) : transcriptError ? (
                          <p className="mt-3 text-[13px] leading-relaxed text-red-600">
                            {transcriptError}
                          </p>
                        ) : transcriptText ? (
                          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                            {transcriptText}
                          </p>
                        ) : (
                          <p className="mt-3 text-[13px] text-[var(--color-text-muted)]">
                            —
                          </p>
                        )}
                      </section>

                      <div
                        className="shrink-0 border-t border-[var(--color-border-primary)] bg-white"
                        style={{ padding: '12px 20px 20px' }}
                      >
                        <label
                          htmlFor="competitor-reel-note"
                          className="block text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
                        >
                          Моя нотатка
                        </label>
                        <textarea
                          id="competitor-reel-note"
                          rows={3}
                          value={reelPanelNote}
                          onChange={(e) =>
                            setReelPanelNote(
                              e.target.value.slice(0, MAX_REEL_NOTE_CHARS)
                            )
                          }
                          readOnly={savedShortCodes.includes(selectedReel.shortCode)}
                          maxLength={MAX_REEL_NOTE_CHARS}
                          placeholder="Моя нотатка до цього рілсу…"
                          className="mt-1.5 w-full min-h-[4.5rem] resize-y rounded-[var(--border-radius-md)] border border-[var(--color-border-primary)] bg-white px-3 py-2 text-[13px] leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-link)] focus:outline-none focus:ring-2 focus:ring-[var(--color-link-soft)] read-only:bg-[var(--color-background-secondary)] read-only:text-[var(--color-text-secondary)]"
                        />
                        {saveError && (
                          <p className="mb-2 mt-2 text-center text-xs text-red-600">{saveError}</p>
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
                            disabled={saveBusy}
                            onClick={() => void onSaveTemplate(selectedReel)}
                            className="w-full cursor-pointer rounded-[var(--border-radius-lg)] bg-gradient-to-r from-[#004BA8] to-[#0d5bb8] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-[#0d5bb8] hover:to-[#1565c0] disabled:cursor-wait disabled:opacity-80"
                          >
                            {saveBusy
                              ? 'Транскрипція та шаблон…'
                              : 'Зберегти в рілси'}
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
