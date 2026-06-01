import type { BrandSettings } from '@/lib/brand';
import { contrastRatio, normalizeHex } from '@/lib/brand';
import type { Slide, SlideLayoutPreset, SlideType } from '@/lib/carouselTypes';
import { resolveSlideType } from '@/lib/carouselTypes';

const BODY_TEXT_MIN = 4.5;
const TITLE_TEXT_MIN = 3;
const BLACK = '#000000';

export type CarouselBrandPalette = {
  light: string;
  accent1: string;
  accent2: string;
  dark: string;
};

type ResolvedSlideContext = {
  slideType: SlideType;
  layoutPreset: SlideLayoutPreset | null;
};

function pickFirstPassing(colors: string[], background: string, minContrast: number): string | null {
  for (const color of colors) {
    if (contrastRatio(color, background) >= minContrast) return color;
  }
  return null;
}

function pickBestContrast(colors: string[], background: string): string {
  const sorted = [...colors].sort((a, b) => contrastRatio(b, background) - contrastRatio(a, background));
  return sorted[0];
}

/**
 * Perceived luminance (0–1) used as an auto-contrast threshold. We deliberately
 * use a luminance threshold rather than raw max-WCAG-contrast: on a saturated
 * mid-dark color (e.g. brand red) black can technically out-contrast white, but
 * the design intent (and the auto-contrast spec) is light text on dark/red
 * backgrounds and dark text on light backgrounds.
 */
function isDarkBackground(hex: string): boolean {
  const h = normalizeHex(hex).replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.55;
}

function getSlideContext(slide: Slide, index: number, total: number): ResolvedSlideContext {
  return {
    slideType: resolveSlideType(slide, index, total),
    layoutPreset: slide.layoutPreset ?? (slide.slideType === 'final' ? 'goal' : 'text'),
  };
}

export function getCarouselBrandPalette(brand: BrandSettings | null | undefined): CarouselBrandPalette {
  return {
    light: normalizeHex(brand?.colors.lightBg ?? '#F5F2ED'),
    accent1: normalizeHex(brand?.colors.accent1 ?? '#E05C40'),
    accent2: normalizeHex(brand?.colors.accent2 ?? '#5D6B9F'),
    dark: normalizeHex(brand?.colors.darkBg ?? '#141414'),
  };
}

export function getAutomaticBackgroundColor(
  slideType: SlideType,
  layoutPreset: SlideLayoutPreset | null,
  palette: CarouselBrandPalette,
): string {
  if (slideType === 'cover') return palette.accent1;
  if (slideType === 'final') return palette.accent1;
  if (layoutPreset === 'list' || layoutPreset === 'text') return palette.light;
  return palette.accent1;
}

const WHITE = '#FFFFFF';

export function resolveTitleAndBodyColors(
  backgroundType: Slide['backgroundType'],
  backgroundColor: string,
  palette: CarouselBrandPalette,
): { titleColor: string; bodyColor: string } {
  const bg = normalizeHex(backgroundColor);
  if (backgroundType === 'image' || backgroundType === 'gradient') {
    return { titleColor: palette.light, bodyColor: palette.light };
  }

  // Dark / saturated (e.g. brand red) backgrounds → light text.
  if (isDarkBackground(bg)) {
    // Prefer the brand light color when it reads cleanly, else pure white.
    const lightTitle =
      pickFirstPassing([palette.light, WHITE], bg, TITLE_TEXT_MIN) ?? WHITE;
    const lightBody =
      pickFirstPassing([palette.light, WHITE], bg, BODY_TEXT_MIN) ?? WHITE;
    return { titleColor: lightTitle, bodyColor: lightBody };
  }

  // Light backgrounds → dark text. Titles may use a brand accent when it
  // contrasts (keeps the branded look); body stays black for readability.
  const title =
    pickFirstPassing([palette.accent1, palette.accent2, palette.dark, BLACK], bg, TITLE_TEXT_MIN) ??
    pickBestContrast([palette.accent1, palette.accent2, palette.dark, BLACK], bg);
  const body = contrastRatio(BLACK, bg) >= BODY_TEXT_MIN ? BLACK : palette.dark;
  return { titleColor: title, bodyColor: body };
}

export function resolveSlideVisualColors(
  slide: Slide,
  index: number,
  total: number,
  palette: CarouselBrandPalette,
): { backgroundColor: string; titleColor: string; bodyColor: string } {
  const { slideType, layoutPreset } = getSlideContext(slide, index, total);
  const hasOverride = slide.hasBackgroundOverride === true;
  const baseBackground = hasOverride
    ? normalizeHex(slide.backgroundColor || palette.light)
    : getAutomaticBackgroundColor(slideType, layoutPreset, palette);
  const hasImage =
    slide.backgroundType === 'image' &&
    Boolean(
      (slide.backgroundImageUrl && slide.backgroundImageUrl.trim().length > 0) ||
        (slide.backgroundImageBase64 && slide.backgroundImageBase64.trim().length > 0),
    );
  const effectiveBackgroundType =
    slide.backgroundType === 'image' && !hasImage ? 'color' : slide.backgroundType;
  const text = resolveTitleAndBodyColors(effectiveBackgroundType, baseBackground, palette);
  const keepExistingText = slide.textColorUserSet === true || slide.textColorAutoSet === true;
  return {
    backgroundColor: baseBackground,
    titleColor: keepExistingText ? slide.titleColor : text.titleColor,
    bodyColor: keepExistingText ? slide.bodyColor : text.bodyColor,
  };
}
