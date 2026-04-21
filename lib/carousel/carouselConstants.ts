import type { BrandAccentStyle } from '@/lib/brand';

/** Instagram vertical carousel canvas (4:5) */
export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1350;
/** Backward-compatible alias for width where older code expects a single size. */
export const CANVAS_SIZE = CANVAS_WIDTH;
export const PADDING = 88;
export const WATERMARK_Y = 36;
export const DOT_BOTTOM_Y = 44;

export const DEFAULT_BG = '#faf9f7';
export const DEFAULT_DARK = '#141414';
export const DEFAULT_ACCENT = '#e05c40';
export const DEFAULT_CREAM = '#f5f2ed';

export type SlideTemplateKind = 'cover' | 'slide' | 'final';

export type BrandDnaForRender = {
  vibe: 'bold' | 'refined';
  primaryColor: string;
  accentColor: string;
  accentStyle: BrandAccentStyle;
  /** Kept for future use; carousel export uses Noto stack */
  fontPairing: string;
};
