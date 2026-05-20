import { existsSync } from 'fs';
import { join } from 'path';
import { GlobalFonts } from '@napi-rs/canvas';
import type { CarouselFonts } from '@/lib/carousel/canvasSegmentedText';

// `GlobalFonts` is process-global with no unregister API. To stay correct
// across concurrent requests on a warm worker we register every brand font
// under its own unique family names (e.g. `Brand_manrope_sans`) and cache
// the resolved name set per `font_id`. Family names are never reused across
// brands, so there is no first-match conflict to resolve.
const fontsByPairing = new Map<string, CarouselFonts>();
let fallbackFontsCache: CarouselFonts | null = null;

const FONT_DIR = join(process.cwd(), 'public', 'fonts');

const FONT_PACKAGE_BY_ID: Record<string, string> = {
  google_sans: 'google-sans',
  manrope: 'manrope',
  cormorant: 'cormorant-garamond',
  days_one: 'days-one',
  climate_crisis: 'climate-crisis',
  inter: 'inter',
  montserrat: 'montserrat',
};

function resolveFontsourceFile(
  fontsourceDir: string,
  packageName: string,
  weight: '400' | '700',
  style: 'normal' | 'italic',
): string | null {
  const subsets = ['cyrillic', 'latin-ext', 'latin'];
  const exts = ['woff2', 'woff', 'ttf', 'otf'];
  for (const subset of subsets) {
    for (const ext of exts) {
      const filePath = join(fontsourceDir, packageName, 'files', `${packageName}-${subset}-${weight}-${style}.${ext}`);
      if (existsSync(filePath)) {
        return filePath;
      }
    }
  }
  return null;
}

function registerAliasFromFontsource(
  fontsourceDir: string,
  packageName: string,
  alias: string,
  weight: '400' | '700',
  style: 'normal' | 'italic',
): boolean {
  const resolved = resolveFontsourceFile(fontsourceDir, packageName, weight, style);
  if (!resolved) return false;
  return Boolean(GlobalFonts.registerFromPath(resolved, alias));
}

function ensureFallbackFonts(): CarouselFonts {
  if (fallbackFontsCache) return fallbackFontsCache;
  GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSans-Regular.ttf'), 'CarouselFallbackSans');
  GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSans-Bold.ttf'), 'CarouselFallbackSansBold');
  GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSans-Italic.ttf'), 'CarouselFallbackSansItalic');
  GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSerif-Italic.ttf'), 'CarouselFallbackSerifItalic');
  fallbackFontsCache = {
    sans: 'CarouselFallbackSans',
    sansBold: 'CarouselFallbackSansBold',
    sansItalic: 'CarouselFallbackSansItalic',
    serifItalic: 'CarouselFallbackSerifItalic',
  };
  return fallbackFontsCache;
}

export function ensureCarouselFonts(fontPairing?: string | null): CarouselFonts {
  const requestedFontId = (fontPairing ?? '').trim().toLowerCase();
  const cacheKey = requestedFontId || '__fallback__';
  const cached = fontsByPairing.get(cacheKey);
  if (cached) return cached;

  const fallback = ensureFallbackFonts();
  const packageName = FONT_PACKAGE_BY_ID[requestedFontId] ?? null;
  if (!packageName) {
    fontsByPairing.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const fontsourceDir = join(process.cwd(), 'node_modules', '@fontsource');
    const safe = packageName.replace(/[^a-zA-Z0-9]/g, '_');
    const candidate = {
      sans: `Brand_${safe}_sans`,
      sansBold: `Brand_${safe}_sansBold`,
      sansItalic: `Brand_${safe}_sansItalic`,
      serifItalic: `Brand_${safe}_serifItalic`,
    };

    const body = registerAliasFromFontsource(fontsourceDir, packageName, candidate.sans, '400', 'normal');
    const title =
      registerAliasFromFontsource(fontsourceDir, packageName, candidate.sansBold, '700', 'normal') ||
      registerAliasFromFontsource(fontsourceDir, packageName, candidate.sansBold, '400', 'normal');
    const sansItalic =
      registerAliasFromFontsource(fontsourceDir, packageName, candidate.sansItalic, '400', 'italic') ||
      registerAliasFromFontsource(fontsourceDir, packageName, candidate.sansItalic, '400', 'normal');
    const serifItalic =
      registerAliasFromFontsource(fontsourceDir, packageName, candidate.serifItalic, '700', 'italic') ||
      registerAliasFromFontsource(fontsourceDir, packageName, candidate.serifItalic, '400', 'italic') ||
      registerAliasFromFontsource(fontsourceDir, packageName, candidate.serifItalic, '400', 'normal');

    const resolved: CarouselFonts = {
      sans: body ? candidate.sans : fallback.sans,
      sansBold: title ? candidate.sansBold : fallback.sansBold,
      sansItalic: sansItalic ? candidate.sansItalic : fallback.sansItalic,
      serifItalic: serifItalic ? candidate.serifItalic : fallback.serifItalic,
    };

    console.info(
      `[carousel] fonts ready for "${requestedFontId}" (body=${body} title=${title} sansItalic=${sansItalic} serifItalic=${serifItalic})`,
    );
    if (!body || !title || !sansItalic || !serifItalic) {
      console.warn(
        `[carousel] Partial font alias registration for "${requestedFontId}". Falling back to bundled defaults for missing variants.`,
      );
    }
    fontsByPairing.set(cacheKey, resolved);
    return resolved;
  } catch (e) {
    console.warn('[carousel] font registration:', e);
    fontsByPairing.set(cacheKey, fallback);
    return fallback;
  }
}
