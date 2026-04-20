export type SlidePlacement = 'top' | 'center' | 'bottom';

export type SlideTextAlign = 'left' | 'center' | 'right';

export type SlideLayout = 'title_and_text' | 'text_only';

/** Instagram carousel template (AI + export). Legacy slides omit this and it is inferred when generating images. */
export type SlideKind = 'cover' | 'content' | 'statement' | 'bullets' | 'cta';

export type SlideOverlayType = 'full' | 'backdrop' | 'frost' | 'gradient';

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
  backgroundType: 'color' | 'image';
  backgroundColor: string;
  backgroundImageUrl: string | null;
  backgroundImageBase64: string | null;
  titleColor: string;
  bodyColor: string;
  generatedImageBase64: string | null;
  /** Photo overlay mode; `null` when background is not a photo. */
  overlayType: SlideOverlayType | null;
  /** Hex overlay tint (Brand DNA palette). */
  overlayColor: string;
  /** 0–100, step 5 in UI; not used for frost. */
  overlayOpacity: number;
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
  if (slide.slideKind) return slide.slideKind;
  if (total <= 1) return 'content';
  if (index === 0) return 'cover';
  if (index === total - 1) return 'cta';
  return 'content';
}
