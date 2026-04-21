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

export function resolveTitleAndBodyColors(
  backgroundType: Slide['backgroundType'],
  backgroundColor: string,
  palette: CarouselBrandPalette,
): { titleColor: string; bodyColor: string } {
  const bg = normalizeHex(backgroundColor);
  if (backgroundType === 'image' || backgroundType === 'gradient') {
    return { titleColor: palette.light, bodyColor: palette.light };
  }

  if (bg === palette.light) {
    const title =
      pickFirstPassing([palette.accent1, palette.accent2, BLACK], bg, TITLE_TEXT_MIN) ??
      pickBestContrast([palette.accent1, palette.accent2, BLACK], bg);
    return { titleColor: title, bodyColor: BLACK };
  }

  if (bg === palette.accent1) {
    const title =
      pickFirstPassing([palette.accent2, BLACK], bg, TITLE_TEXT_MIN) ??
      pickBestContrast([palette.accent2, BLACK], bg);
    const body = contrastRatio(BLACK, bg) >= BODY_TEXT_MIN ? BLACK : palette.light;
    return { titleColor: title, bodyColor: body };
  }

  if (bg === palette.accent2) {
    const title =
      pickFirstPassing([palette.accent1, BLACK], bg, TITLE_TEXT_MIN) ??
      pickBestContrast([palette.accent1, BLACK], bg);
    const body = contrastRatio(BLACK, bg) >= BODY_TEXT_MIN ? BLACK : palette.light;
    return { titleColor: title, bodyColor: body };
  }

  if (bg === palette.dark) {
    const title =
      pickFirstPassing([palette.light, palette.accent2], bg, TITLE_TEXT_MIN) ??
      pickBestContrast([palette.light, palette.accent2], bg);
    return { titleColor: title, bodyColor: palette.light };
  }

  const titleCandidates = [palette.accent1, palette.accent2, palette.light, BLACK];
  const title =
    pickFirstPassing(titleCandidates, bg, TITLE_TEXT_MIN) ?? pickBestContrast(titleCandidates, bg);
  const body = contrastRatio(BLACK, bg) >= BODY_TEXT_MIN ? BLACK : palette.light;
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
  const text = resolveTitleAndBodyColors(slide.backgroundType, baseBackground, palette);
  return {
    backgroundColor: baseBackground,
    titleColor: text.titleColor,
    bodyColor: text.bodyColor,
  };
}
