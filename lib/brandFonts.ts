export interface BrandFont {
  id: string;
  label: string; // shown in the selector UI
  /** For fonts.googleapis.com; omit or leave empty when `bundled` is true */
  googleFamily: string;
  /** Served from @fontsource in globals.css (e.g. Google Sans), not the Fonts API */
  bundled?: boolean;
  titleWeight: string; // font-weight used for slide titles
  titleStyle: string; // 'normal' | 'italic'
  bodyWeight: string; // font-weight used for body/text slides
  bodyAvailable: boolean; // false = titles only, body falls back to Inter 400
  previewText: string; // short preview string shown in the selector
}

export const BRAND_FONTS: BrandFont[] = [
  {
    id: 'montserrat',
    label: 'Montserrat',
    googleFamily: 'Montserrat:wght@400;700',
    titleWeight: '700',
    titleStyle: 'normal',
    bodyWeight: '400',
    bodyAvailable: true,
    previewText: 'Сучасний і чіткий',
  },
  {
    id: 'cormorant',
    label: 'Cormorant Garamond',
    googleFamily: 'Cormorant+Garamond:wght@700',
    titleWeight: '700',
    titleStyle: 'normal',
    bodyWeight: '400',
    bodyAvailable: false, // titles only — body falls back to Inter 400
    previewText: 'Елегантний і серйозний',
  },
  {
    id: 'days_one',
    label: 'Days One',
    googleFamily: 'Days+One',
    titleWeight: '400', // Days One only has one weight
    titleStyle: 'normal',
    bodyWeight: '400',
    bodyAvailable: false, // titles only
    previewText: 'Жирний і впевнений',
  },
  {
    id: 'climate_crisis',
    label: 'Climate Crisis',
    googleFamily: 'Climate+Crisis',
    titleWeight: '400', // variable, use 400 as default
    titleStyle: 'normal',
    bodyWeight: '400',
    bodyAvailable: false, // titles only
    previewText: 'Драматичний і сміливий',
  },
  {
    id: 'google_sans',
    label: 'Google Sans',
    googleFamily: '',
    bundled: true,
    titleWeight: '700',
    titleStyle: 'normal',
    bodyWeight: '400',
    bodyAvailable: true,
    previewText: 'Чистий і знайомий',
  },
  {
    id: 'inter',
    label: 'Inter',
    googleFamily: 'Inter:wght@400;700',
    titleWeight: '700',
    titleStyle: 'normal',
    bodyWeight: '400',
    bodyAvailable: true,
    previewText: 'Нейтральний і читабельний',
  },
];

// Body fallback when bodyAvailable === false
export const BODY_FALLBACK_FONT = 'Inter';
export const BODY_FALLBACK_GOOGLE_FAMILY = 'Inter:wght@400';

export function getDefaultFontForVibe(vibe: 'bold' | 'refined'): string {
  // returns BrandFont.id
  if (vibe === 'bold') return 'montserrat';
  if (vibe === 'refined') return 'cormorant';
  return 'montserrat';
}

export function resolveBrandFont(fontId: string | null | undefined): BrandFont {
  return BRAND_FONTS.find((f) => f.id === fontId) ?? BRAND_FONTS[0];
}
