import { nanoid } from 'nanoid';
import type {
  Slide,
  SlideKind,
  SlideOverlayType,
  SlideType,
  SlideLayoutPreset,
  SlideBulletStyle,
  SlideCtaAction,
  SlideTitleSize,
  SlideBodySize,
} from '@/lib/carouselTypes';
import { CAROUSEL_DEFAULT_BG } from '@/lib/carouselTypes';
import { sanitizeBgPhotoTransform } from '@/lib/carousel/bgPhotoTransform';

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
    hasBackgroundOverride: false,
    backgroundColor: CAROUSEL_DEFAULT_BG,
    gradientMidColor: '#D6B58A',
    gradientEndColor: '#1A1A2E',
    backgroundImageUrl: null,
    backgroundImageBase64: null,
    bgPhotoTransform: undefined,
    titleColor: '#FFFFFF',
    bodyColor: '#FFFFFF',
    generatedImageBase64: null,
    overlayType: null,
    overlayColor,
    overlayOpacity: 50,
    slideType: 'slide',
    layoutPreset: 'text',
    optionalLabel: '',
    listItems: null,
    bulletStyle: 'numbered-padded',
    testimonialAuthor: null,
    ctaAction: 'follow',
    ctaTitle: '',
    ctaKeyword: '',
    titleSize: 'L',
    bodySize: 'M',
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

function isSlideType(x: unknown): x is SlideType {
  return x === 'cover' || x === 'slide' || x === 'final';
}

function isLayoutPreset(x: unknown): x is SlideLayoutPreset {
  return x === 'text' || x === 'quote' || x === 'testimonial' || x === 'list' || x === 'goal' || x === 'reaction';
}

function isBulletStyle(x: unknown): x is SlideBulletStyle {
  return (
    x === 'numbered-padded' ||
    x === 'numbered-simple' ||
    x === 'dots' ||
    x === 'dashes' ||
    x === 'checks' ||
    x === 'cross-check'
  );
}

function isCtaAction(x: unknown): x is SlideCtaAction {
  return x === 'follow' || x === 'save' || x === 'share' || x === 'comment' || x === 'link';
}

function isTitleSize(x: unknown): x is SlideTitleSize {
  return x === 'L' || x === 'M';
}

function isBodySize(x: unknown): x is SlideBodySize {
  return x === 'M' || x === 'S';
}

/** Restore slides from DB JSON; fills missing fields for older rows. */
export function normalizeSlidesFromDb(raw: unknown): Slide[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const base = createEmptySlide();
    const backgroundType = o.backgroundType === 'image' ? 'image' : o.backgroundType === 'gradient' ? 'gradient' : 'color';
    const backgroundImageUrl =
      o.backgroundImageUrl === null || typeof o.backgroundImageUrl === 'string'
        ? o.backgroundImageUrl
        : null;
    const backgroundImageBase64 =
      o.backgroundImageBase64 === null || typeof o.backgroundImageBase64 === 'string'
        ? o.backgroundImageBase64
        : null;
    const bgPhotoTransform = sanitizeBgPhotoTransform(o.bgPhotoTransform);
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

    const legacyKind = isSlideKind(o.slideKind) ? o.slideKind : undefined;
    const slideType =
      isSlideType(o.slideType)
        ? o.slideType
        : legacyKind === 'cover'
          ? 'cover'
          : legacyKind === 'cta'
            ? 'final'
            : 'slide';
    const layoutPreset =
      isLayoutPreset(o.layoutPreset)
        ? o.layoutPreset
        : legacyKind === 'statement'
          ? 'quote'
          : legacyKind === 'bullets'
            ? 'list'
            : legacyKind === 'cta'
              ? 'goal'
              : 'text';

    return {
      ...base,
      id: typeof o.id === 'string' && o.id ? o.id : nanoid(),
      title: typeof o.title === 'string' ? o.title : '',
      body: typeof o.body === 'string' ? o.body : '',
      layout: isSlideLayout(o.layout) ? o.layout : base.layout,
      design_note:
        o.design_note === null || typeof o.design_note === 'string' ? o.design_note : null,
      slideKind: legacyKind ?? base.slideKind,
      label: o.label === null || typeof o.label === 'string' ? o.label : base.label,
      items: Array.isArray(o.items) ? (o.items as string[]).filter((x) => typeof x === 'string') : base.items,
      icon: o.icon === null || typeof o.icon === 'string' ? o.icon : base.icon,
      placement: isPlacement(o.placement) ? o.placement : base.placement,
      textAlign: isTextAlign(o.textAlign) ? o.textAlign : base.textAlign,
      backgroundType,
      hasBackgroundOverride: o.hasBackgroundOverride === true,
      backgroundColor: typeof o.backgroundColor === 'string' ? o.backgroundColor : base.backgroundColor,
      gradientMidColor:
        typeof o.gradientMidColor === 'string' ? o.gradientMidColor : base.gradientMidColor,
      gradientEndColor:
        typeof o.gradientEndColor === 'string' ? o.gradientEndColor : base.gradientEndColor,
      backgroundImageUrl,
      backgroundImageBase64,
      bgPhotoTransform,
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
      slideType,
      layoutPreset,
      optionalLabel: typeof o.optionalLabel === 'string' ? o.optionalLabel : '',
      listItems: Array.isArray(o.listItems) ? (o.listItems as string[]).filter((x) => typeof x === 'string') : null,
      bulletStyle: isBulletStyle(o.bulletStyle) ? o.bulletStyle : 'numbered-padded',
      testimonialAuthor:
        o.testimonialAuthor && typeof o.testimonialAuthor === 'object'
          ? {
              name: typeof (o.testimonialAuthor as Record<string, unknown>).name === 'string' ? ((o.testimonialAuthor as Record<string, unknown>).name as string) : '',
              handle:
                typeof (o.testimonialAuthor as Record<string, unknown>).handle === 'string'
                  ? ((o.testimonialAuthor as Record<string, unknown>).handle as string)
                  : '',
              avatar_url:
                (o.testimonialAuthor as Record<string, unknown>).avatar_url === null ||
                typeof (o.testimonialAuthor as Record<string, unknown>).avatar_url === 'string'
                  ? ((o.testimonialAuthor as Record<string, unknown>).avatar_url as string | null)
                  : null,
            }
          : null,
      ctaAction: isCtaAction(o.ctaAction) ? o.ctaAction : 'follow',
      ctaTitle: typeof o.ctaTitle === 'string' ? o.ctaTitle : '',
      ctaKeyword: typeof o.ctaKeyword === 'string' ? o.ctaKeyword : '',
      titleSize: isTitleSize(o.titleSize) ? o.titleSize : 'L',
      bodySize: isBodySize(o.bodySize) ? o.bodySize : 'M',
    };
  });
}

/** Strip generated previews before persisting (PNG base64 is large). */
export function slidesForDatabase(slides: Slide[]): Slide[] {
  return slides.map((s) => ({ ...s, generatedImageBase64: null }));
}
