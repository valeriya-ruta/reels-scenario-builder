import type { BrandSettings } from '@/lib/brand';
import { normalizeAccentStyle } from '@/lib/brand';
import type { ProBrand } from '@/lib/pro/types';

/** Map a per-blogger brand row to the app's BrandSettings shape (used for SSR seeding). */
export function proBrandToBrandSettings(b: ProBrand): BrandSettings {
  const fav = b.favColorHex ?? '#FF6B6B';
  return {
    theme: b.theme,
    vibe: b.vibe,
    favColorHex: fav,
    colors: {
      lightBg: b.colors.lightBg ?? '#ffffff',
      darkBg: b.colors.darkBg ?? '#111111',
      accent1: b.colors.accent1 ?? fav,
      accent2: b.colors.accent2 ?? fav,
    },
    fontId: b.fontId ?? 'montserrat',
    accentStyle: normalizeAccentStyle(b.accentStyle),
  };
}
