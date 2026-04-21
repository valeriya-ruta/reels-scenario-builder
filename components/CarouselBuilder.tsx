'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Check, Circle, Download, Loader2 } from 'lucide-react';
import type { CarouselRantOutput, Slide } from '@/lib/carouselTypes';
import { CAROUSEL_DEFAULT_BG, resolveSlideType } from '@/lib/carouselTypes';
import { createEmptySlide, normalizeSlidesFromDb } from '@/lib/carouselSlides';
import {
  saveCarouselSlides,
  updateCarouselProjectName,
  updateCarouselWatermarkHandle,
} from '@/app/carousel-actions';
import { createClient } from '@/lib/supabaseClient';
import { useNavBadges } from '@/components/NavBadgeContext';
import { readPendingCarouselFromStorage, useRantResults } from '@/components/RantResultsContext';
import { useBrandStore } from '@/components/BrandProvider';
import type { BrandAccentStyle } from '@/lib/brand';
import { normalizeAccentStyle, normalizeHex } from '@/lib/brand';
import Link from 'next/link';
import { resolveBrandFont } from '@/lib/brandFonts';
import CarouselEditorLayout from '@/components/carousel/CarouselEditorLayout';
import { DEFAULT_BG_PHOTO_TRANSFORM } from '@/lib/carousel/bgPhotoTransform';

const MAX_SLIDES = 20;
const AA_CONTRAST_MIN = 4.5;

function linearizeChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function getLuminance(hex: string): number {
  const safe = normalizeHex(hex).slice(1);
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

function getContrastRatio(foreground: string, background: string): number {
  const fgL = getLuminance(foreground);
  const bgL = getLuminance(background);
  const [hi, lo] = fgL > bgL ? [fgL, bgL] : [bgL, fgL];
  return (hi + 0.05) / (lo + 0.05);
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
  initialWatermarkHandle: string;
}

export default function CarouselBuilder({
  projectId,
  initialProjectName,
  initialSlides,
  initialWatermarkHandle,
}: CarouselBuilderProps) {
  const { brandSettings, refetchBrand } = useBrandStore();
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [unsplashForId, setUnsplashForId] = useState<string | null>(null);
  const [pendingRantOutput, setPendingRantOutput] = useState<CarouselRantOutput | null>(null);
  const [watermarkDraft, setWatermarkDraft] = useState(initialWatermarkHandle);
  const [accentDraft, setAccentDraft] = useState<BrandAccentStyle>(() =>
    normalizeAccentStyle(brandSettings?.accentStyle),
  );

  const slideListTopRef = useRef<HTMLDivElement | null>(null);
  const slidesRef = useRef<Slide[]>(slides);
  slidesRef.current = slides;
  const { setBadge, clearBadge } = useNavBadges();
  const { state: rantResultsState, clearResult: clearRantResult } = useRantResults();
  const skipPersistRef = useRef(true);
  const watermarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAccentDraft(normalizeAccentStyle(brandSettings?.accentStyle));
  }, [brandSettings?.accentStyle]);

  useEffect(() => {
    if (!slides.length) return;
    if (activeSlideId && slides.some((s) => s.id === activeSlideId)) return;
    setActiveSlideId(slides[0].id);
  }, [slides, activeSlideId]);

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

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void saveCarouselSlides(projectId, slides);
    }, 1400);
    return () => window.clearTimeout(t);
  }, [projectId, slides]);

  useEffect(() => {
    if (watermarkTimerRef.current) clearTimeout(watermarkTimerRef.current);
    watermarkTimerRef.current = setTimeout(() => {
      void updateCarouselWatermarkHandle(projectId, watermarkDraft);
    }, 800);
    return () => {
      if (watermarkTimerRef.current) clearTimeout(watermarkTimerRef.current);
    };
  }, [projectId, watermarkDraft]);

  useEffect(() => {
    if (accentTimerRef.current) clearTimeout(accentTimerRef.current);
    accentTimerRef.current = setTimeout(() => {
      void (async () => {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from('brand_settings').update({ accent_style: accentDraft }).eq('user_id', user.id);
        void refetchBrand();
      })();
    }, 800);
    return () => {
      if (accentTimerRef.current) clearTimeout(accentTimerRef.current);
    };
  }, [accentDraft, refetchBrand]);

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
  const canDownload = useMemo(() => slides.some((s) => Boolean(s.generatedImageBase64)), [slides]);

  const getAutoTextColors = useCallback(
    (backgroundColor: string) => {
      const background = normalizeHex(backgroundColor);
      const ordered = [...brandColorOptions].sort(
        (a, b) => getContrastRatio(b, background) - getContrastRatio(a, background),
      );
      const usable = ordered.filter((c) => normalizeHex(c) !== background);
      const title =
        usable.find((c) => getContrastRatio(c, background) >= AA_CONTRAST_MIN) ??
        usable[0] ??
        ordered[0] ??
        '#FFFFFF';
      const body =
        usable.find(
          (c) => normalizeHex(c) !== normalizeHex(title) && getContrastRatio(c, background) >= AA_CONTRAST_MIN,
        ) ??
        usable.find((c) => normalizeHex(c) !== normalizeHex(title)) ??
        title;
      return {
        titleColor: normalizeHex(title),
        bodyColor: normalizeHex(body),
      };
    },
    [brandColorOptions],
  );

  const updateSlide = useCallback((id: string, patch: Partial<Slide>) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  useEffect(() => {
    if (brandColorOptions.length === 0) return;
    setSlides((prev) =>
      prev.map((slide) => {
        if (slide.backgroundType !== 'color') return slide;
        const hasBrandBg = brandColorOptions.some(
          (color) => normalizeHex(color) === normalizeHex(slide.backgroundColor),
        );
        const nextBg = hasBrandBg ? slide.backgroundColor : brandColorOptions[0];
        return { ...slide, backgroundColor: nextBg, ...getAutoTextColors(nextBg) };
      }),
    );
  }, [brandColorOptions, getAutoTextColors]);

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
    const s = createEmptySlide({ overlayColor: overlayDefault });
    const defaultBg = brandColorOptions[0] ?? CAROUSEL_DEFAULT_BG;
    const auto = getAutoTextColors(defaultBg);
    s.backgroundColor = defaultBg;
    s.titleColor = auto.titleColor;
    s.bodyColor = auto.bodyColor;
    setSlides((prev) => [...prev, s]);
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
      return;
    }
    setValidationError(null);
    setIsGenerating(true);
    setGeneratingIndex(0);
    const snapshot = slides;
    setDoneMask(snapshot.map(() => false));
    setHasGenerated(false);

    const total = snapshot.length;
    try {
      for (let i = 0; i < snapshot.length; i++) {
        setGeneratingIndex(i);
        const s = snapshot[i];
        const body: Record<string, unknown> = {
          title: s.title,
          body: s.body,
          placement: s.placement,
          text_align: s.textAlign,
          background_type: s.backgroundType,
          background_color: s.backgroundColor,
          gradient_mid_color: s.gradientMidColor ?? null,
          gradient_end_color: s.gradientEndColor ?? null,
          background_image_url: s.backgroundType === 'image' ? s.backgroundImageUrl : null,
          title_color: s.titleColor,
          body_color: s.bodyColor,
          slide_index: i + 1,
          total_slides: total,
          slide_type: resolveSlideType(s, i, total),
          layout_preset: s.layoutPreset ?? null,
          label: s.optionalLabel ?? null,
          items: s.listItems ?? s.items ?? null,
          icon: s.icon ?? null,
          bullet_style: s.bulletStyle ?? null,
          testimonial_author: s.testimonialAuthor ?? null,
          cta_action: s.ctaAction ?? null,
          cta_title: s.ctaTitle ?? null,
          cta_keyword: s.ctaKeyword ?? null,
          title_size: s.titleSize ?? 'L',
          body_size: s.bodySize ?? 'M',
          design_note: s.design_note ?? null,
          overlay_type: s.backgroundType === 'image' ? s.overlayType : null,
          overlay_color: s.overlayColor,
          overlay_opacity: s.overlayOpacity,
          bg_photo_transform: s.backgroundType === 'image' ? s.bgPhotoTransform ?? DEFAULT_BG_PHOTO_TRANSFORM : null,
        };
        if (s.backgroundType === 'image' && s.backgroundImageBase64) {
          body.background_image_base64 = s.backgroundImageBase64;
        }

        const res = await fetch('/api/carousel/generate-slide', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { image_base64?: string; error?: string };
        if (!res.ok || !data.image_base64) {
          throw new Error(data.error ?? 'Помилка генерації');
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
      console.error(e);
      setValidationError('Не вдалося згенерувати слайди.');
    } finally {
      setIsGenerating(false);
      setGeneratingIndex(0);
    }
  };

  const downloadAll = async () => {
    let stagger = 0;
    for (let i = 0; i < slides.length; i++) {
      const b64 = slides[i].generatedImageBase64;
      if (!b64) continue;
      window.setTimeout(() => {
        const a = document.createElement('a');
        a.href = `data:image/png;base64,${b64}`;
        a.download = `ruta-carousel-${i + 1}.png`;
        a.click();
      }, stagger);
      stagger += 200;
    }
    clearBadge('carousel');
    setHasDownloaded(true);
    showToast('Слайди збережено ✓');
  };

  const downloadOne = (i: number) => {
    const b64 = slides[i].generatedImageBase64;
    if (!b64) return;
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${b64}`;
    a.download = `ruta-carousel-${i + 1}.png`;
    a.click();
    clearBadge('carousel');
    setHasDownloaded(true);
    showToast('Слайди збережено ✓');
  };

  const editMore = () => {
    setSlides((prev) => prev.map((s) => ({ ...s, generatedImageBase64: null })));
    setHasGenerated(false);
  };

  const mapRantOutputToSlides = useCallback(
    (output: CarouselRantOutput): Slide[] => {
      const defaultBg = brandColorOptions[0] ?? CAROUSEL_DEFAULT_BG;
      const auto = getAutoTextColors(defaultBg);
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
        slide.titleColor = auto.titleColor;
        slide.bodyColor = auto.bodyColor;
        return slide;
      });
    },
    [brandColorOptions, getAutoTextColors, brandSettings?.colors.darkBg],
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
            onClick={() => (canDownload ? void downloadAll() : void runGeneration())}
            className="ml-auto hidden items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50 md:inline-flex"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : canDownload ? <Download className="h-4 w-4" /> : null}
            {isGenerating ? 'Генеруємо…' : canDownload ? 'Завантажити всі' : 'Згенерувати карусель'}
          </button>
        </div>
      </div>

      {validationError && (
        <p className="hidden px-4 text-sm text-red-600 md:block" role="alert">
          {validationError}
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

      {isGenerating && (
        <div className="mx-4 rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-zinc-900">Генеруємо слайди…</p>
          <ul className="space-y-2 text-sm">
            {slides.map((_, i) => (
              <li key={i} className="flex items-center gap-2">
                {doneMask[i] ? (
                  <Check className="h-4 w-4 text-[color:var(--accent)]" />
                ) : generatingIndex === i ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" />
                ) : (
                  <Circle className="h-4 w-4 text-zinc-300" />
                )}
                <span className="text-zinc-700">Слайд {i + 1}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasGenerated && (
        <div className="mx-4 space-y-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]/40 px-4 py-4">
          <p className="text-sm font-medium text-zinc-900">Готово! 🎉</p>
          <div className="flex flex-wrap gap-2">
            {slides.map((s, i) =>
              s.generatedImageBase64 ? (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => downloadOne(i)}
                  className="btn-secondary rounded-lg border border-[color:var(--border)] bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-[color:var(--surface)]"
                >
                  ⬇ Слайд {i + 1}
                </button>
              ) : null,
            )}
          </div>
          <button
            type="button"
            onClick={editMore}
            className="rounded-xl border border-[color:var(--border)] bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)]"
          >
            ✏ Редагувати далі
          </button>
        </div>
      )}

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
        getAutoTextColors={getAutoTextColors}
        accentDraft={accentDraft}
        onAccentDraft={setAccentDraft}
        watermarkDraft={watermarkDraft}
        onWatermarkDraft={setWatermarkDraft}
        hasGenerated={hasGenerated}
        isGenerating={isGenerating}
        onGenerate={() => void runGeneration()}
        onDownloadAll={() => void downloadAll()}
        validationError={validationError}
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
