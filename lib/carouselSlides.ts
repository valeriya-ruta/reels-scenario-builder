import { nanoid } from 'nanoid';
import type { Slide, SlideKind, SlideOverlayType } from '@/lib/carouselTypes';
import { CAROUSEL_DEFAULT_BG } from '@/lib/carouselTypes';

export function createEmptySlide(brandDefaults?: { overlayColor: string }): Slide {
  const overlayColor = brandDefaults?.overlayColor ?? CAROUSEL_DEFAULT_BG;
  return {
    id: nanoid(),
    title: '',
    body: '',
    layout: 'title_and_text',
    design_note: null,
    slideKind: undefined,
    label: null,
    items: null,
    icon: null,
    placement: 'center',
    textAlign: 'left',
    backgroundType: 'color',
    backgroundColor: CAROUSEL_DEFAULT_BG,
    backgroundImageUrl: null,
    backgroundImageBase64: null,
    titleColor: '#FFFFFF',
    bodyColor: '#FFFFFF',
    generatedImageBase64: null,
    overlayType: null,
    overlayColor,
    overlayOpacity: 50,
  };
}

function isSlideLayout(x: unknown): x is NonNullable<Slide['layout']> {
  return x === 'title_and_text' || x === 'text_only';
}

function isPlacement(x: unknown): x is Slide['placement'] {
  return x === 'top' || x === 'center' || x === 'bottom';
}

function isTextAlign(x: unknown): x is Slide['textAlign'] {
  return x === 'left' || x === 'center' || x === 'right';
}

function isSlideKind(x: unknown): x is SlideKind {
  return x === 'cover' || x === 'content' || x === 'statement' || x === 'bullets' || x === 'cta';
}

function isOverlayType(x: unknown): x is SlideOverlayType {
  return x === 'full' || x === 'backdrop' || x === 'frost' || x === 'gradient';
}

/** Restore slides from DB JSON; fills missing fields for older rows. */
export function normalizeSlidesFromDb(raw: unknown): Slide[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const base = createEmptySlide();
    const backgroundType = o.backgroundType === 'image' ? 'image' : 'color';
    const backgroundImageUrl =
      o.backgroundImageUrl === null || typeof o.backgroundImageUrl === 'string'
        ? o.backgroundImageUrl
        : null;
    const backgroundImageBase64 =
      o.backgroundImageBase64 === null || typeof o.backgroundImageBase64 === 'string'
        ? o.backgroundImageBase64
        : null;
    const hasPhoto =
      backgroundType === 'image' &&
      Boolean(
        (backgroundImageUrl && backgroundImageUrl.length > 0) ||
          (backgroundImageBase64 && backgroundImageBase64.length > 0),
      );

    let overlayType: Slide['overlayType'];
    if (o.overlayType !== undefined && o.overlayType !== null && isOverlayType(o.overlayType)) {
      overlayType = o.overlayType;
    } else if (hasPhoto) {
      overlayType = 'full';
    } else {
      overlayType = null;
    }

    return {
      ...base,
      id: typeof o.id === 'string' && o.id ? o.id : nanoid(),
      title: typeof o.title === 'string' ? o.title : '',
      body: typeof o.body === 'string' ? o.body : '',
      layout: isSlideLayout(o.layout) ? o.layout : base.layout,
      design_note:
        o.design_note === null || typeof o.design_note === 'string' ? o.design_note : null,
      slideKind: isSlideKind(o.slideKind) ? o.slideKind : base.slideKind,
      label: o.label === null || typeof o.label === 'string' ? o.label : base.label,
      items: Array.isArray(o.items) ? (o.items as string[]).filter((x) => typeof x === 'string') : base.items,
      icon: o.icon === null || typeof o.icon === 'string' ? o.icon : base.icon,
      placement: isPlacement(o.placement) ? o.placement : base.placement,
      textAlign: isTextAlign(o.textAlign) ? o.textAlign : base.textAlign,
      backgroundType,
      backgroundColor: typeof o.backgroundColor === 'string' ? o.backgroundColor : base.backgroundColor,
      backgroundImageUrl,
      backgroundImageBase64,
      titleColor: typeof o.titleColor === 'string' ? o.titleColor : base.titleColor,
      bodyColor: typeof o.bodyColor === 'string' ? o.bodyColor : base.bodyColor,
      generatedImageBase64:
        o.generatedImageBase64 === null || typeof o.generatedImageBase64 === 'string'
          ? o.generatedImageBase64
          : null,
      overlayType,
      overlayColor: typeof o.overlayColor === 'string' ? o.overlayColor : base.overlayColor,
      overlayOpacity:
        typeof o.overlayOpacity === 'number' && Number.isFinite(o.overlayOpacity)
          ? Math.min(100, Math.max(0, Math.round(o.overlayOpacity)))
          : base.overlayOpacity,
    };
  });
}

/** Strip generated previews before persisting (PNG base64 is large). */
export function slidesForDatabase(slides: Slide[]): Slide[] {
  return slides.map((s) => ({ ...s, generatedImageBase64: null }));
}
