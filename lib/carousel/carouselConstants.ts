import type { BrandAccentStyle } from '@/lib/brand';

/** Instagram square carousel canvas */
export const CANVAS_SIZE = 1080;
export const PADDING = 88;
export const WATERMARK_Y = 36;
export const DOT_BOTTOM_Y = 44;

export const DEFAULT_BG = '#faf9f7';
export const DEFAULT_DARK = '#141414';
export const DEFAULT_ACCENT = '#e05c40';
export const DEFAULT_CREAM = '#f5f2ed';

export type SlideTemplateKind = 'cover' | 'content' | 'statement' | 'bullets' | 'cta';

export type BrandDnaForRender = {
  vibe: 'bold' | 'refined';
  primaryColor: string;
  accentColor: string;
  accentStyle: BrandAccentStyle;
  /** Kept for future use; carousel export uses Noto stack */
  fontPairing: string;
};
