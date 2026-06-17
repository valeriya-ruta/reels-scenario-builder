import { existsSync } from 'fs';
import { join } from 'path';
import { GlobalFonts } from '@napi-rs/canvas';
import type { CarouselFonts } from '@/lib/carousel/canvasSegmentedText';
import { resolveBrandFont } from '@/lib/brandFonts';

/** @fontsource package used for body text when a brand font is titles-only
 *  (bodyAvailable === false). Mirrors the editor's BODY_FALLBACK_FONT (Inter). */
const BODY_FALLBACK_PACKAGE = 'inter';

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

/**
 * Register EVERY available subset (latin + latin-ext + cyrillic) for a given
 * weight/style, EACH under its own unique family name, and return a CSS font
 * fallback STACK (comma-separated, quoted) covering them.
 *
 * @fontsource ships one file per subset. @napi-rs/canvas does NOT merge glyph
 * coverage across faces sharing a family name (the first registration wins), so
 * registering all subsets under one family left either latin OR cyrillic as
 * tofu. A comma-separated font stack, however, IS honored for per-glyph
 * fallback — so we register each subset separately and join them. Returns an
 * empty array when no subset file is present (caller falls back to NotoSans).
 */
function registerSubsetStack(
  fontsourceDir: string,
  packageName: string,
  aliasPrefix: string,
  weight: '400' | '700',
  style: 'normal' | 'italic',
): string[] {
  const subsets = ['latin', 'latin-ext', 'cyrillic'];
  const exts = ['woff2', 'woff', 'ttf', 'otf'];
  const families: string[] = [];
  for (const subset of subsets) {
    for (const ext of exts) {
      const filePath = join(
        fontsourceDir,
        packageName,
        'files',
        `${packageName}-${subset}-${weight}-${style}.${ext}`,
      );
      if (existsSync(filePath)) {
        const family = `${aliasPrefix}_${subset.replace(/-/g, '')}`;
        if (GlobalFonts.registerFromPath(filePath, family)) families.push(family);
        break; // one extension per subset is enough
      }
    }
  }
  return families;
}

/** Build a quoted CSS family stack, always ending in the bundled fallback. */
function toFontStack(families: string[], fallbackFamily: string): string {
  return [...families, fallbackFamily].map((f) => `"${f}"`).join(', ');
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
    // A real brand font was requested but we have no mapping for it — exported
    // text will render in the WRONG (fallback) face. Surface loudly.
    if (requestedFontId) {
      console.error(
        `[carousel][fonts] No @fontsource package mapped for brand font "${requestedFontId}". ` +
          `Falling back to NotoSans — exported text will NOT match the editor. ` +
          `Add it to FONT_PACKAGE_BY_ID.`,
      );
    }
    fontsByPairing.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const fontsourceDir = join(process.cwd(), 'node_modules', '@fontsource');
    const safe = packageName.replace(/[^a-zA-Z0-9]/g, '_');
    const prefix = `Brand_${safe}`;

    // The body font may differ from the title font. Brand fonts with
    // bodyAvailable === false (e.g. Cormorant, Days One, Climate Crisis) are
    // titles-only: the editor renders their BODY in the sans fallback (Inter),
    // NOT in the title typeface. Mirror that here so exported body text doesn't
    // fall into the serif title face (task 86d3c75bx). Title roles (sansBold,
    // serifItalic) always come from the brand package; body roles (sans,
    // sansItalic) come from the brand package only when it has a real body face.
    const brandFont = resolveBrandFont(requestedFontId);
    const bodyPackage =
      brandFont.bodyAvailable ? packageName : (FONT_PACKAGE_BY_ID[BODY_FALLBACK_PACKAGE] ?? packageName);
    const bodySafe = bodyPackage.replace(/[^a-zA-Z0-9]/g, '_');
    const bodyPrefix = `Brand_${bodySafe}`;

    const bodyFams = registerSubsetStack(fontsourceDir, bodyPackage, `${bodyPrefix}_sans`, '400', 'normal');
    const titleFams = (() => {
      const w700 = registerSubsetStack(fontsourceDir, packageName, `${prefix}_sansBold`, '700', 'normal');
      if (w700.length) return w700;
      // A 700-weight title font whose bold face failed to register must NOT
      // silently degrade to the brand's regular (400) face — that renders the
      // title THIN (task 86d36eg64). Returning [] makes toFontStack fall back to
      // the bundled bold Noto face, preserving the bold weight. Single-weight
      // brand fonts (titleWeight 400, e.g. Days One / Climate Crisis) genuinely
      // have only one face, so for those we do use the 400 file.
      const wantsBold = Number(brandFont.titleWeight) >= 600;
      if (wantsBold) return [];
      return registerSubsetStack(fontsourceDir, packageName, `${prefix}_sansBold`, '400', 'normal');
    })();
    const sansItalicFams = (() => {
      const it = registerSubsetStack(fontsourceDir, bodyPackage, `${bodyPrefix}_sansItalic`, '400', 'italic');
      return it.length ? it : registerSubsetStack(fontsourceDir, bodyPackage, `${bodyPrefix}_sansItalic`, '400', 'normal');
    })();
    const serifItalicFams = (() => {
      const a = registerSubsetStack(fontsourceDir, packageName, `${prefix}_serifItalic`, '700', 'italic');
      if (a.length) return a;
      const b = registerSubsetStack(fontsourceDir, packageName, `${prefix}_serifItalic`, '400', 'italic');
      if (b.length) return b;
      return registerSubsetStack(fontsourceDir, packageName, `${prefix}_serifItalic`, '400', 'normal');
    })();

    const body = bodyFams.length > 0;
    const title = titleFams.length > 0;
    const sansItalic = sansItalicFams.length > 0;
    const serifItalic = serifItalicFams.length > 0;

    // Each role is a CSS fallback STACK: brand subsets first, NotoSans last so a
    // missing glyph (or a missing subset) still renders rather than tofu.
    const resolved: CarouselFonts = {
      sans: toFontStack(bodyFams, fallback.sans),
      sansBold: toFontStack(titleFams, fallback.sansBold),
      sansItalic: toFontStack(sansItalicFams, fallback.sansItalic),
      serifItalic: toFontStack(serifItalicFams, fallback.serifItalic),
    };

    // The primary faces (body 400 + title 700/400) are what most slides use.
    // If they failed to register, the @fontsource files almost certainly did
    // not ship to this environment (e.g. not traced into the serverless
    // bundle) — that means a silent wrong-font export, so make it LOUD.
    if (!body || !title) {
      const fontsourceExists = existsSync(join(fontsourceDir, packageName, 'files'));
      console.error(
        `[carousel][fonts] FAILED to register brand font "${requestedFontId}" (package "${packageName}"). ` +
          `body=${body} title=${title} sansItalic=${sansItalic} serifItalic=${serifItalic}. ` +
          `@fontsource files present on disk: ${fontsourceExists}. ` +
          `Exported text is falling back to NotoSans and will NOT match the editor.`,
      );
    } else if (!sansItalic || !serifItalic) {
      console.warn(
        `[carousel][fonts] Partial registration for "${requestedFontId}" (italic/serif missing): ` +
          `sansItalic=${sansItalic} serifItalic=${serifItalic}. Using NotoSans for those variants only.`,
      );
    } else {
      console.info(`[carousel][fonts] ready for "${requestedFontId}" (all variants registered)`);
    }
    fontsByPairing.set(cacheKey, resolved);
    return resolved;
  } catch (e) {
    console.warn('[carousel] font registration:', e);
    fontsByPairing.set(cacheKey, fallback);
    return fallback;
  }
}
