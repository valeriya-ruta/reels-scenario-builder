'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Download, Loader2 } from 'lucide-react';
import type { CarouselRantOutput, Slide } from '@/lib/carouselTypes';
import { CAROUSEL_DEFAULT_BG, resolveSlideType } from '@/lib/carouselTypes';
import { createEmptySlide, normalizeSlidesFromDb } from '@/lib/carouselSlides';
import { updateCarouselProjectName } from '@/app/carousel-actions';
import { persistCarouselSlides } from '@/lib/carousel/persistSlides';
import { useNavBadges } from '@/components/NavBadgeContext';
import { readPendingCarouselFromStorage, useRantResults } from '@/components/RantResultsContext';
import { useBrandStore } from '@/components/BrandProvider';
import { normalizeAccentStyle, normalizeHex } from '@/lib/brand';
import {
  getCarouselBrandPalette,
  resolveSlideVisualColors,
  resolveTitleAndBodyColors,
} from '@/lib/carousel/colorSystem';
import Link from 'next/link';
import { resolveBrandFont } from '@/lib/brandFonts';
import CarouselEditorLayout from '@/components/carousel/CarouselEditorLayout';
import CarouselExportOverlay from '@/components/carousel/CarouselExportOverlay';
import { saveSlideImage, saveSlidesIndividually } from '@/lib/carousel/downloadImage';
import {
  DEFAULT_BG_PHOTO_TRANSFORM,
  getBgPhotoTransform,
  normalizeBgPhotoTransform,
} from '@/lib/carousel/bgPhotoTransform';
import { createClient } from '@/lib/supabaseClient';

const MAX_SLIDES = 20;

class CarouselGenerationError extends Error {
  status?: number;
  responseBody?: string;

  constructor(message: string, status?: number, responseBody?: string) {
    super(message);
    this.name = 'CarouselGenerationError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

type NormalizedGenerationError = {
  message: string;
  status?: number;
  responseBody?: string;
  stack?: string;
  isNetworkError: boolean;
};

function normalizeGenerationError(error: unknown): NormalizedGenerationError {
  if (error instanceof CarouselGenerationError) {
    return {
      message: error.message || 'Помилка генерації',
      status: error.status,
      responseBody: error.responseBody,
      stack: error.stack,
      isNetworkError: false,
    };
  }
  if (error instanceof Error) {
    const networkHint = /network|fetch|failed to fetch|load failed|connection/i.test(error.message);
    return {
      message: error.message || 'Невідома помилка',
      stack: error.stack,
      isNetworkError: networkHint,
    };
  }
  return {
    message: typeof error === 'string' ? error : 'Невідома помилка',
    isNetworkError: false,
  };
}

function getFriendlyGenerationErrorMessage(err: NormalizedGenerationError): { main: string; detail: string | null } {
  const status = err.status;
  if (status === 401 || status === 403) {
    return { main: 'Session expired, please reload', detail: null };
  }
  if (status === 429) {
    return { main: 'Too many requests, try again in a moment', detail: null };
  }
  if (status === 413 || /payload too large|entity too large|request entity too large/i.test(err.message)) {
    return { main: 'Image too large, try a smaller file', detail: null };
  }
  if (status === 504 || /timeout|timed out/i.test(err.message)) {
    return { main: 'Generation took too long, try fewer slides', detail: null };
  }
  if (err.isNetworkError) {
    return { main: 'Connection issue, check your internet', detail: null };
  }
  return {
    main: 'Не вдалося згенерувати слайди.',
    detail: err.message || null,
  };
}

function isCarouselEmpty(slides: Slide[]): boolean {
  return slides.every((s) => !s.title.trim() && !s.body.trim() && !s.generatedImageBase64);
}

type UnsplashHit = { id: string; regular: string; thumb: string };

function UnsplashModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hits, setHits] = useState<UnsplashHit[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (q: string, p: number, append: boolean) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/unsplash/search?${new URLSearchParams({ query: q, page: String(p) })}`);
      const data = (await res.json()) as {
        configured?: boolean;
        results?: UnsplashHit[];
        error?: string;
      };
      if (data.configured === false) {
        setConfigured(false);
        setHits([]);
        return;
      }
      setConfigured(true);
      if (!res.ok) {
        setErr(data.error ?? 'Помилка');
        return;
      }
      const next = data.results ?? [];
      setHits((prev) => (append ? [...prev, ...next] : next));
    } catch {
      setErr('Не вдалося завантажити');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setPage(1);
    setHits([]);
    setErr(null);
    setConfigured(true);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Закрити" onClick={onClose} />
      <div
        className="relative z-[201] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-zinc-900">Пошук зображень</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 hover:bg-[color:var(--surface)]"
            aria-label="Закрити"
          >
            ×
          </button>
        </div>
        {!configured ? (
          <p className="text-sm leading-relaxed text-zinc-600">Unsplash не налаштовано. Завантажте зображення вручну.</p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setPage(1);
                    void load(query, 1, false);
                  }
                }}
                placeholder="Ключові слова…"
                className="min-w-0 flex-1 rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
              />
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  void load(query, 1, false);
                }}
                className="shrink-0 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 active:scale-[0.97]"
              >
                Знайти
              </button>
            </div>
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {hits.map((h) => (
                <button
                  key={`${h.id}-${h.regular}`}
                  type="button"
                  onClick={() => {
                    onPick(h.regular);
                    onClose();
                  }}
                  className="overflow-hidden rounded-lg border border-[color:var(--border)] transition hover:ring-2 hover:ring-[color:var(--accent)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.thumb || h.regular} alt="" className="h-24 w-full object-cover" />
                </button>
              ))}
            </div>
            {hits.length > 0 && (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  void load(query, next, true);
                }}
                className="btn-secondary mt-4 w-full rounded-xl border border-[color:var(--border)] py-2 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)] disabled:opacity-50"
              >
                {loading ? '…' : 'Завантажити ще'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export interface CarouselBuilderProps {
  projectId: string;
  initialProjectName: string;
  initialSlides: Slide[];
}

export default function CarouselBuilder({
  projectId,
  initialProjectName,
  initialSlides,
}: CarouselBuilderProps) {
  const { brandSettings } = useBrandStore();
  const brandFont = useMemo(() => resolveBrandFont(brandSettings?.fontId), [brandSettings?.fontId]);

  const [projectName, setProjectName] = useState(initialProjectName);
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(initialProjectName);
  const [slides, setSlides] = useState<Slide[]>(() => {
    const fromDb = normalizeSlidesFromDb(initialSlides);
    return fromDb.length > 0 ? fromDb : [createEmptySlide()];
  });
  const [activeSlideId, setActiveSlideId] = useState<string | null>(() => null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState(0);
  const [doneMask, setDoneMask] = useState<boolean[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationErrorDetail, setValidationErrorDetail] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [unsplashForId, setUnsplashForId] = useState<string | null>(null);
  const [pendingRantOutput, setPendingRantOutput] = useState<CarouselRantOutput | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const slideListTopRef = useRef<HTMLDivElement | null>(null);
  const slidesRef = useRef<Slide[]>(slides);
  const prevSlidesRef = useRef<Slide[]>(slides);
  const saveSlidesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setBadge, clearBadge } = useNavBadges();
  const { state: rantResultsState, clearResult: clearRantResult } = useRantResults();
  const skipPersistRef = useRef(true);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!slides.length) return;
    if (activeSlideId && slides.some((s) => s.id === activeSlideId)) return;
    setActiveSlideId(slides[0].id);
  }, [slides, activeSlideId]);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  const handleProjectNameSave = useCallback(async () => {
    setEditingProjectName(false);
    const trimmed = projectNameDraft.trim();
    if (trimmed && trimmed !== projectName) {
      setProjectName(trimmed);
      await updateCarouselProjectName(projectId, trimmed);
    } else {
      setProjectNameDraft(projectName);
    }
  }, [projectNameDraft, projectName, projectId]);

  // Run the actual persist. `keepalive` lets the write complete even while the
  // tab/app is being backgrounded or closed (used by the flush path). On failure
  // we re-mark dirty so the next edit / flush retries instead of silently
  // dropping the edit.
  const persistNow = useCallback(
    async (keepalive: boolean) => {
      if (saveSlidesTimerRef.current) {
        clearTimeout(saveSlidesTimerRef.current);
        saveSlidesTimerRef.current = null;
      }
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const result = await persistCarouselSlides(projectId, slidesRef.current, { keepalive });
      if (!result.ok) {
        // Re-mark dirty so the next edit / flush retries instead of dropping work.
        dirtyRef.current = true;
        if (result.tooLarge && !keepalive) {
          // Make the failure visible rather than silently losing the edit.
          setToast('Не вдалося зберегти: зображення завеликі. Зменш або заміни фото.');
          window.setTimeout(() => setToast(null), 4000);
        }
        console.error('[carousel] autosave failed', result.error);
      }
    },
    [projectId],
  );

  // Flush synchronously-ish on leave (unmount / hidden / pagehide). keepalive
  // guarantees the browser finishes the request after the page starts unloading.
  const flushSlidesNow = useCallback(() => {
    void persistNow(true);
  }, [persistNow]);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      prevSlidesRef.current = slides;
      return;
    }
    dirtyRef.current = true;
    // Heavy edits (a background photo set/removed, background TYPE change, or a
    // slide add/delete/reorder) persist IMMEDIATELY rather than after the
    // debounce, so a fast close right after picking a background never loses it
    // (a base64 photo is too big for the keepalive flush, so it must be written
    // while the app is still alive). Text edits stay debounced.
    const prev = prevSlidesRef.current;
    const next = slides;
    let heavy = prev.length !== next.length;
    if (!heavy) {
      for (let i = 0; i < next.length; i++) {
        const a = prev[i];
        const b = next[i];
        if (
          !a ||
          a.id !== b.id ||
          a.backgroundType !== b.backgroundType ||
          a.backgroundImageBase64 !== b.backgroundImageBase64 ||
          a.backgroundImageUrl !== b.backgroundImageUrl
        ) {
          heavy = true;
          break;
        }
      }
    }
    prevSlidesRef.current = next;

    if (saveSlidesTimerRef.current) {
      clearTimeout(saveSlidesTimerRef.current);
    }
    saveSlidesTimerRef.current = setTimeout(
      () => {
        void persistNow(false);
      },
      heavy ? 0 : 900,
    );
    return () => {
      if (saveSlidesTimerRef.current) {
        clearTimeout(saveSlidesTimerRef.current);
      }
    };
  }, [persistNow, slides]);

  // Guarantee the pending debounced save is flushed when the user leaves the
  // editor: client-side navigation (unmount), backgrounding the app / switching
  // tabs (visibilitychange -> hidden), or unloading the page (pagehide).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushSlidesNow();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flushSlidesNow);
    window.addEventListener('beforeunload', flushSlidesNow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flushSlidesNow);
      window.removeEventListener('beforeunload', flushSlidesNow);
      flushSlidesNow();
    };
  }, [flushSlidesNow]);

  useEffect(() => {
    if (hasGenerated && !hasDownloaded) {
      setBadge('carousel', true);
    }
  }, [hasGenerated, hasDownloaded, setBadge]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const brandColorOptions = useMemo(() => {
    const options = brandSettings
      ? [
          brandSettings.colors.lightBg,
          brandSettings.colors.darkBg,
          brandSettings.colors.accent1,
          brandSettings.colors.accent2,
        ]
      : [CAROUSEL_DEFAULT_BG, '#FFFFFF', '#000000', '#666666'];

    const unique = Array.from(new Set(options.map((color) => normalizeHex(color))));
    return unique.slice(0, 4);
  }, [brandSettings]);

  const accentStyle = normalizeAccentStyle(brandSettings?.accentStyle);
  const accentColor = brandSettings?.colors.accent1 ?? '#FF6B6B';
  const brandPalette = useMemo(() => getCarouselBrandPalette(brandSettings), [brandSettings]);

  const updateSlide = useCallback((id: string, patch: Partial<Slide>) => {
    setSlides((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const nextPatch: Partial<Slide> = { ...patch };
        if (nextPatch.bgPhotoTransform !== undefined) {
          nextPatch.bgPhotoTransform = normalizeBgPhotoTransform(
            getBgPhotoTransform(nextPatch.bgPhotoTransform ?? undefined),
          );
        }
        const isManualColorPick =
          nextPatch.titleColor !== undefined || nextPatch.bodyColor !== undefined;
        const slideIndex = prev.findIndex((x) => x.id === s.id);
        const visualPatchChanged =
          nextPatch.backgroundType !== undefined ||
          nextPatch.backgroundColor !== undefined ||
          nextPatch.gradientMidColor !== undefined ||
          nextPatch.gradientEndColor !== undefined ||
          nextPatch.backgroundImageUrl !== undefined ||
          nextPatch.backgroundImageBase64 !== undefined ||
          nextPatch.overlayType !== undefined ||
          nextPatch.overlayColor !== undefined ||
          nextPatch.overlayOpacity !== undefined ||
          nextPatch.hasBackgroundOverride !== undefined;
        // Single per-slide manual flag: a manual color pick sets it; ANY
        // background change resets it so auto-contrast re-snaps. (Task: auto
        // contrast on background change + manual override until next bg change.)
        const nextUserSet = isManualColorPick
          ? true
          : visualPatchChanged
            ? false
            : s.textColorUserSet;
        const next = {
          ...s,
          ...nextPatch,
          textColorUserSet: nextUserSet,
        };
        const resolved = resolveSlideVisualColors(next, slideIndex, prev.length, brandPalette);
        const hasActualImage =
          next.backgroundType === 'image' &&
          Boolean(
            (next.backgroundImageUrl && next.backgroundImageUrl.trim().length > 0) ||
              (next.backgroundImageBase64 && next.backgroundImageBase64.trim().length > 0),
          );
        const canAutoContrast =
          visualPatchChanged &&
          !isManualColorPick &&
          next.textColorUserSet !== true &&
          (next.backgroundType !== 'image' || hasActualImage);
        if (canAutoContrast) {
          const auto = resolveTitleAndBodyColors(
            next.backgroundType === 'image' ? 'image' : next.backgroundType,
            resolved.backgroundColor,
            brandPalette,
          );
          return {
            ...next,
            ...resolved,
            titleColor: auto.titleColor,
            bodyColor: auto.bodyColor,
            textColorAutoSet: true,
          };
        }
        return { ...next, ...resolved };
      }),
    );
  }, [brandPalette]);

  useEffect(() => {
    if (brandColorOptions.length === 0) return;
    setSlides((prev) =>
      prev.map((slide) => {
        const index = prev.findIndex((s) => s.id === slide.id);
        return { ...slide, ...resolveSlideVisualColors(slide, index, prev.length, brandPalette) };
      }),
    );
  }, [brandColorOptions, brandPalette]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSlides((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const overlayDefault = brandSettings?.colors.darkBg ?? CAROUSEL_DEFAULT_BG;

  const addSlide = () => {
    if (slides.length >= MAX_SLIDES) return;
    // New slide starting state (per spec): quote layout, white background,
    // "Новий слайд" placeholder text, left alignment, auto-contrast text color.
    const s = createEmptySlide({ overlayColor: overlayDefault });
    s.slideType = 'slide';
    s.layoutPreset = 'quote';
    s.title = 'Новий слайд';
    s.backgroundType = 'color';
    s.hasBackgroundOverride = true;
    s.backgroundColor = '#FFFFFF';
    s.textAlign = 'left';
    s.textColorUserSet = false;
    setSlides((prev) => {
      // Insert right AFTER the currently selected slide (not appended).
      const activeIdx = prev.findIndex((x) => x.id === activeSlideId);
      const insertAt = activeIdx >= 0 ? activeIdx + 1 : prev.length;
      const total = prev.length + 1;
      const resolved = resolveSlideVisualColors(s, insertAt, total, brandPalette);
      const auto = resolveTitleAndBodyColors('color', resolved.backgroundColor, brandPalette);
      const nextSlide = {
        ...s,
        ...resolved,
        titleColor: auto.titleColor,
        bodyColor: auto.bodyColor,
        textColorAutoSet: true,
      };
      const copy = [...prev];
      copy.splice(insertAt, 0, nextSlide);
      return copy;
    });
    setActiveSlideId(s.id);
  };

  const removeSlide = (id: string) => {
    setSlides((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.id !== id);
    });
    setActiveSlideId((cur) => {
      if (cur !== id) return cur;
      const next = slidesRef.current.filter((s) => s.id !== id);
      return next[0]?.id ?? null;
    });
  };

  const runGeneration = async () => {
    const valid = slides.some((s) => s.title.trim().length > 0 || s.body.trim().length > 0);
    if (!valid) {
      setValidationError('Додай заголовок або текст хоча б на одному слайді.');
      setValidationErrorDetail(null);
      return;
    }
    setValidationError(null);
    setValidationErrorDetail(null);
    setIsGenerating(true);
    setGeneratingIndex(0);
    const snapshot = slides;
    setDoneMask(snapshot.map(() => false));
    setHasGenerated(false);
    let currentSlideIndex = 0;

    try {
      // Flush the persisted slide model first so the server-side export renders
      // from exactly what the editor holds (no race with the debounced autosave).
      // This goes through the save route (no 1 MB Server Action cap) — the old
      // server action threw "Body exceeded 1 MB limit" on any slide carrying a
      // base64 photo, which surfaced as the generic export failure (86d39dw6b).
      dirtyRef.current = false;
      const saved = await persistCarouselSlides(projectId, snapshot);
      if (!saved.ok) {
        throw new CarouselGenerationError(
          saved.error ? `Save before export failed: ${saved.error}` : 'Save before export failed',
        );
      }
      for (let i = 0; i < snapshot.length; i++) {
        currentSlideIndex = i;
        setGeneratingIndex(i);

        // The export reads the slide's full visual state from the persisted
        // model; the client only identifies which slide to render.
        const res = await fetch('/api/carousel/generate-slide', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ project_id: projectId, slide_index: i + 1 }),
        });
        const responseText = await res.text();
        let data: { image_base64?: string; error?: string } = {};
        try {
          data = responseText ? (JSON.parse(responseText) as { image_base64?: string; error?: string }) : {};
        } catch {
          data = {};
        }

        if (!res.ok) {
          throw new CarouselGenerationError(data.error ?? `HTTP ${res.status}`, res.status, responseText);
        }
        if (!data.image_base64) {
          throw new CarouselGenerationError(data.error ?? 'Помилка генерації', res.status, responseText);
        }
        setSlides((prev) =>
          prev.map((row, j) => (j === i ? { ...row, generatedImageBase64: data.image_base64! } : row)),
        );
        setDoneMask((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }
      setHasGenerated(true);
      setHasDownloaded(false);
    } catch (e) {
      const normalizedError = normalizeGenerationError(e);
      const errorContext = {
        target: 'carousel',
        operation: 'generate-slide',
        projectId,
        totalSlides: snapshot.length,
        generatingIndex: currentSlideIndex,
        slideType: snapshot[currentSlideIndex]
          ? resolveSlideType(snapshot[currentSlideIndex], currentSlideIndex, snapshot.length)
          : null,
        hasBackgroundImages: snapshot.some((slide) => slide.backgroundType === 'image' && Boolean(slide.backgroundImageBase64 || slide.backgroundImageUrl)),
        imageBase64SlidesCount: snapshot.filter((slide) => Boolean(slide.backgroundImageBase64)).length,
      };
      console.error('[carousel/generation] Failed to generate carousel.', {
        message: normalizedError.message,
        status: normalizedError.status,
        responseBody: normalizedError.responseBody,
        stack: normalizedError.stack,
        context: errorContext,
      });
      void (async () => {
        try {
          const { data: userData } = await supabase.auth.getUser();
          const userId = userData.user?.id ?? null;
          const { error: logError } = await supabase.from('error_logs').insert({
            user_id: userId,
            timestamp: new Date().toISOString(),
            error_message: normalizedError.message,
            error_stack: normalizedError.stack ?? null,
            context: {
              ...errorContext,
              status: normalizedError.status ?? null,
              responseBody: normalizedError.responseBody ?? null,
            },
          });
          if (logError) {
            console.warn('[carousel/generation] Failed to write to error_logs:', logError);
          }
        } catch (logFailure) {
          console.warn('[carousel/generation] Error while logging to Supabase:', logFailure);
        }
      })();

      const mappedError = getFriendlyGenerationErrorMessage(normalizedError);
      setValidationError(mappedError.main);
      setValidationErrorDetail(mappedError.detail);
    } finally {
      setIsGenerating(false);
      setGeneratingIndex(0);
    }
  };

  // Bulk save — each slide as its OWN file straight to the gallery, in order
  // (no ZIP: unpacking an archive on a phone is the pain Ruta asked us to drop).
  // Every call recreates its own download/share resources, so the 2nd, 3rd, Nth
  // export behaves exactly like the 1st with no app restart. Feedback is always
  // a real SAVE/DOWNLOAD message — never a success toast that masks a no-op.
  const downloadAll = () => {
    void (async () => {
      const { count, outcome } = await saveSlidesIndividually(
        slides.map((s) => s.generatedImageBase64),
        { baseName: 'ruta-carousel', shareTitle: projectName },
      );
      if (outcome === 'failed' || count === 0) {
        showToast('Немає згенерованих слайдів для збереження');
        return;
      }
      clearBadge('carousel');
      setHasDownloaded(true);
      showToast(
        outcome === 'shared'
          ? `Зберігаємо ${count} слайд(ів) у галерею…`
          : `Завантажується ${count} слайд(ів)…`,
      );
    })();
  };

  const downloadOne = (i: number) => {
    const b64 = slides[i].generatedImageBase64;
    if (!b64) return;
    void (async () => {
      const outcome = await saveSlideImage(b64, `ruta-carousel-${i + 1}.png`, projectName);
      if (outcome === 'failed') {
        showToast('Не вдалося зберегти слайд');
        return;
      }
      clearBadge('carousel');
      setHasDownloaded(true);
      showToast(
        outcome === 'shared' ? `Зберігаємо слайд ${i + 1}…` : `Слайд ${i + 1} завантажується…`,
      );
    })();
  };

  // Export now lives in a blur overlay off the editor canvas. Opening it always
  // re-renders from the just-saved persisted model so the output reflects the
  // latest edits; the overlay shows the animation, then the download actions.
  const startExport = () => {
    setExportOpen(true);
    void runGeneration();
  };

  const closeExport = () => {
    setExportOpen(false);
  };

  const mapRantOutputToSlides = useCallback(
    (output: CarouselRantOutput): Slide[] => {
      const defaultBg = brandColorOptions[0] ?? CAROUSEL_DEFAULT_BG;
      const oc = brandSettings?.colors.darkBg ?? CAROUSEL_DEFAULT_BG;
      return output.slides.map((s, index) => {
        const slide = createEmptySlide({ overlayColor: oc });
        slide.title = (s.title ?? '').trim();
        slide.body = (s.body ?? '').trim();
        slide.layout = s.layout === 'text_only' ? 'text_only' : 'title_and_text';
        slide.design_note = s.design_note ?? null;
        slide.optionalLabel = s.label != null ? String(s.label).trim() || '' : '';
        slide.listItems = Array.isArray(s.items) ? s.items.map(String) : null;
        slide.icon = s.icon != null ? String(s.icon).trim() || null : null;
        slide.slideType = index === 0 ? 'cover' : index === output.slides.length - 1 ? 'final' : 'slide';
        slide.layoutPreset =
          slide.slideType === 'cover'
            ? null
            : slide.slideType === 'final'
              ? 'goal'
              : s.type === 'statement'
                ? 'quote'
                : s.type === 'bullets'
                  ? 'list'
                  : 'text';
        slide.backgroundColor = defaultBg;
        slide.hasBackgroundOverride = false;
        Object.assign(slide, resolveSlideVisualColors(slide, index, output.slides.length, brandPalette));
        return slide;
      });
    },
    [brandColorOptions, brandSettings?.colors.darkBg, brandPalette],
  );

  const applyRantSlides = useCallback(
    (output: CarouselRantOutput) => {
      const next = mapRantOutputToSlides(output);
      setSlides(next);
      setActiveSlideId(next[0]?.id ?? null);
      setHasGenerated(false);
      setDoneMask([]);
      setPendingRantOutput(null);
      requestAnimationFrame(() => {
        slideListTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [mapRantOutputToSlides],
  );

  useEffect(() => {
    const pending = rantResultsState.carousel ?? readPendingCarouselFromStorage();
    if (!pending?.slides?.length) return;
    if (isCarouselEmpty(slidesRef.current)) {
      applyRantSlides(pending);
    } else {
      setPendingRantOutput(pending);
    }
    clearRantResult('carousel');
  }, [rantResultsState.carousel, applyRantSlides, clearRantResult]);

  const handleConfirmReplaceSlides = () => {
    if (!pendingRantOutput) return;
    applyRantSlides(pendingRantOutput);
  };

  if (!brandSettings) {
    return null;
  }

  return (
    <div ref={slideListTopRef} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="hidden px-4 pt-4 md:block">
        <Link
          href="/carousel"
          className="mb-2 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700"
        >
          ← До всіх каруселей
        </Link>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {editingProjectName ? (
            <input
              autoFocus
              value={projectNameDraft}
              onChange={(e) => setProjectNameDraft(e.target.value)}
              onBlur={() => void handleProjectNameSave()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleProjectNameSave();
                if (e.key === 'Escape') {
                  setProjectNameDraft(projectName);
                  setEditingProjectName(false);
                }
              }}
              className="font-display min-w-0 max-w-md rounded-lg border border-[color:var(--border)] bg-white px-2 py-1 text-xl font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
            />
          ) : (
            <h1
              className="font-display cursor-pointer text-xl font-semibold text-zinc-900 hover:text-zinc-700"
              onClick={() => setEditingProjectName(true)}
            >
              {projectName}
            </h1>
          )}
          <span className="text-sm text-zinc-500">
            {slides.length} / {MAX_SLIDES}
          </span>
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => startExport()}
            className="ml-auto hidden items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50 md:inline-flex"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isGenerating ? 'Експортуємо…' : 'Експортувати'}
          </button>
        </div>
      </div>

      {validationError && (
        <p className="hidden px-4 text-sm text-red-600 md:block" role="alert">
          {validationError}
          {validationErrorDetail ? <span className="mt-1 block text-xs text-red-500/90">{validationErrorDetail}</span> : null}
        </p>
      )}

      {pendingRantOutput && (
        <div className="mx-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-zinc-800">
          <p className="mb-3">Є нові слайди з дашборду. Замінити {slides.length} поточних слайдів?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleConfirmReplaceSlides}
              className="rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Замінити
            </button>
            <button
              type="button"
              onClick={() => setPendingRantOutput(null)}
              className="rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)]"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <CarouselEditorLayout
          slides={slides}
          activeSlideId={activeSlideId}
          setActiveSlideId={setActiveSlideId}
          brandSettings={brandSettings}
          brandFont={brandFont}
          accentStyle={accentStyle}
          accentColor={accentColor}
          updateSlide={updateSlide}
          addSlide={addSlide}
          removeSlide={removeSlide}
          onDragEnd={handleDragEnd}
          onUnsplash={() => activeSlideId && setUnsplashForId(activeSlideId)}
          brandColorOptions={brandColorOptions}
          isGenerating={isGenerating}
          onExport={startExport}
          validationError={validationError}
          validationErrorDetail={validationErrorDetail}
        />
      </div>

      <CarouselExportOverlay
        open={exportOpen}
        isGenerating={isGenerating}
        hasGenerated={hasGenerated}
        generatedImages={slides.map((s) => s.generatedImageBase64)}
        generatingIndex={generatingIndex}
        doneMask={doneMask}
        errorMessage={validationError}
        onDownloadAll={downloadAll}
        onDownloadOne={downloadOne}
        onClose={closeExport}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-[300] rounded-xl border border-[color:var(--border)] bg-white px-4 py-3 text-sm shadow-lg">
          {toast}
        </div>
      )}

      <UnsplashModal
        open={unsplashForId !== null}
        onClose={() => setUnsplashForId(null)}
        onPick={(url) => {
          if (unsplashForId) {
            updateSlide(unsplashForId, {
              backgroundImageUrl: url,
              backgroundImageBase64: null,
              overlayType: 'full',
              bgPhotoTransform: DEFAULT_BG_PHOTO_TRANSFORM,
            });
          }
          setUnsplashForId(null);
        }}
      />
    </div>
  );
}
