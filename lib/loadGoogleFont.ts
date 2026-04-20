import type { BrandFont } from '@/lib/brandFonts';
import { BODY_FALLBACK_GOOGLE_FAMILY, BRAND_FONTS } from '@/lib/brandFonts';

export function loadGoogleFont(font: BrandFont) {
  const existing = document.querySelector(`link[data-brand-font]`);
  if (existing) existing.remove();

  const families: string[] = [];
  if (!font.bundled && font.googleFamily) {
    families.push(font.googleFamily);
  }
  if (!font.bodyAvailable) {
    families.push(BODY_FALLBACK_GOOGLE_FAMILY);
  }

  if (families.length === 0) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.setAttribute('data-brand-font', 'true');
  link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
  document.head.appendChild(link);
}

/** Loads all catalogue faces so Brand DNA font cards render in their real typefaces. */
export function loadBrandFontsCatalog() {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector(`link[data-brand-font-catalog]`);
  if (existing) return;

  const families = new Set<string>();
  for (const f of BRAND_FONTS) {
    if (!f.bundled && f.googleFamily) {
      families.add(f.googleFamily);
    }
    if (!f.bodyAvailable) {
      families.add(BODY_FALLBACK_GOOGLE_FAMILY);
    }
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.setAttribute('data-brand-font-catalog', 'true');
  link.href = `https://fonts.googleapis.com/css2?${[...families].map((f) => `family=${f}`).join('&')}&display=swap`;
  document.head.appendChild(link);
}
