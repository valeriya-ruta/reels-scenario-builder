export type SlidePlacement = 'top' | 'center' | 'bottom';

export type SlideTextAlign = 'left' | 'center' | 'right';

export type SlideLayout = 'title_and_text' | 'text_only';

/** Instagram carousel template (AI + export). Legacy slides omit this and it is inferred when generating images. */
export type SlideKind = 'cover' | 'content' | 'statement' | 'bullets' | 'cta';
export type SlideType = 'cover' | 'slide' | 'final';
export type SlideLayoutPreset = 'text' | 'quote' | 'testimonial' | 'list' | 'goal' | 'reaction';
export type SlideBulletStyle =
  | 'numbered-padded'
  | 'numbered-simple'
  | 'dots'
  | 'dashes'
  | 'checks'
  | 'cross-check';
export type SlideCtaAction = 'follow' | 'save' | 'share' | 'comment' | 'link';
export type SlideTitleSize = 'L' | 'M';
export type SlideBodySize = 'M' | 'S';

export type SlideOverlayType = 'full' | 'backdrop' | 'frost' | 'gradient';
export type BgPhotoTransform = {
  /** Fraction of frame width (+ right, - left). */
  offset_x: number;
  /** Fraction of frame height (+ down, - up). */
  offset_y: number;
  /** Relative zoom where 1.0 is "cover fit". */
  scale: number;
};

export type Slide = {
  id: string;
  title: string;
  body: string;
  layout?: SlideLayout;
  design_note?: string | null;
  slideKind?: SlideKind;
  label?: string | null;
  items?: string[] | null;
  icon?: string | null;
  placement: SlidePlacement;
  /** Horizontal alignment of title + body block. */
  textAlign: SlideTextAlign;
  backgroundType: 'color' | 'gradient' | 'image';
  /** True when user explicitly picks a custom background in the editor. */
  hasBackgroundOverride?: boolean;
  backgroundColor: string;
  /** Gradient stop at 60% (when backgroundType === 'gradient'). */
  gradientMidColor?: string;
  /** Gradient stop at 100% (when backgroundType === 'gradient'). */
  gradientEndColor?: string;
  backgroundImageUrl: string | null;
  backgroundImageBase64: string | null;
  /** Optional for backward compatibility; missing means centered with scale=1. */
  bgPhotoTransform?: BgPhotoTransform;
  titleColor: string;
  bodyColor: string;
  generatedImageBase64: string | null;
  /** Photo overlay mode; `null` when background is not a photo. */
  overlayType: SlideOverlayType | null;
  /** Hex overlay tint (Brand DNA palette). */
  overlayColor: string;
  /** 0–100, step 5 in UI; not used for frost. */
  overlayOpacity: number;
  /** New structural slide system */
  slideType?: SlideType;
  /** For `slide` and `final` */
  layoutPreset?: SlideLayoutPreset | null;
  optionalLabel?: string | null;
  listItems?: string[] | null;
  bulletStyle?: SlideBulletStyle | null;
  testimonialAuthor?: { name: string; handle: string; avatar_url: string | null } | null;
  ctaAction?: SlideCtaAction | null;
  ctaTitle?: string | null;
  ctaKeyword?: string | null;
  titleSize?: SlideTitleSize;
  bodySize?: SlideBodySize;
};

export type CarouselState = {
  slides: Slide[];
  activeSlideId: string | null;
  isGenerating: boolean;
  generatingIndex: number;
  hasGenerated: boolean;
};

/** Відповідь `/api/carousel/rant-to-slides` */
export type CarouselRantSlide = {
  slide_number?: number;
  /** New carousel template system */
  type?: SlideKind;
  title: string | null;
  body: string | null;
  label?: string | null;
  items?: string[] | null;
  icon?: string | null;
  accent_spans?: unknown;
  /** @deprecated AI may omit; kept for older clients */
  layout?: SlideLayout;
  design_note?: string | null;
};

export type CarouselRantOutput = {
  total_slides: number;
  slides: CarouselRantSlide[];
};

export const CAROUSEL_DEFAULT_BG = '#1A1A2E';

export function resolveSlideKind(slide: Slide, index: number, total: number): SlideKind {
  if (slide.slideType === 'cover') return 'cover';
  if (slide.slideType === 'final') return 'cta';
  if (slide.slideType === 'slide') {
    if (slide.layoutPreset === 'quote' || slide.layoutPreset === 'testimonial') return 'statement';
    if (slide.layoutPreset === 'list') return 'bullets';
    return 'content';
  }
  if (slide.slideKind) return slide.slideKind;
  if (total <= 1) return 'content';
  if (index === 0) return 'cover';
  if (index === total - 1) return 'cta';
  return 'content';
}

export function resolveSlideType(slide: Slide, index: number, total: number): SlideType {
  if (slide.slideType) return slide.slideType;
  const kind = resolveSlideKind(slide, index, total);
  if (kind === 'cover') return 'cover';
  if (kind === 'cta') return 'final';
  return 'slide';
}
