// ─────────────────────────────────────────────────────────────────────────────
// Google Sans (with Ukrainian Cyrillic) for the lab, under a private family name
// `GoogleSansElegant` so it never affects the rest of the app (which references a
// bare "Google Sans" it never actually loads).
//   • Browser: @font-face pointing at /carousel-lab/fonts/*.woff2 (served static).
//   • Export : same faces embedded as base64 so a rasterized SVG is self-contained.
// unicode-range values are copied verbatim from @fontsource/google-sans so the
// browser fetches only the subsets a glyph needs; Cyrillic covers Ukrainian
// (І Ї Є Ґ — U+0400-045F + U+0490-0491).
// ─────────────────────────────────────────────────────────────────────────────

import { FONT_FAMILY } from './tokens';

export { FONT_FAMILY };

type Subset = { name: string; range: string };

const SUBSETS: Subset[] = [
  {
    name: 'latin',
    range:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
  {
    name: 'latin-ext',
    range:
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  },
  { name: 'cyrillic', range: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' },
  {
    name: 'cyrillic-ext',
    range: 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
  },
];

/** Weights we actually render: body 500, chip 600, title/label 700. */
export const LAB_WEIGHTS = [500, 600, 700] as const;

// Served from /lab-fonts (NOT /carousel-lab/*, which middleware redirects for
// unauthenticated requests because it starts with "/carousel").
const FONT_BASE = '/lab-fonts';

function faceUrl(weight: number, subset: string): string {
  return `${FONT_BASE}/google-sans-${subset}-${weight}-normal.woff2`;
}

/** @font-face CSS for the browser (url-based). */
export function browserFontFaceCss(): string {
  const rules: string[] = [];
  for (const w of LAB_WEIGHTS) {
    for (const s of SUBSETS) {
      rules.push(
        `@font-face{font-family:'${FONT_FAMILY}';font-style:normal;font-weight:${w};` +
          `font-display:swap;src:url(${faceUrl(w, s.name)}) format('woff2');unicode-range:${s.range};}`,
      );
    }
  }
  return rules.join('\n');
}

const STYLE_ID = 'carousel-lab-fontface';
let readyPromise: Promise<void> | null = null;

/** Inject @font-face once and resolve when the faces used are actually ready. */
export function ensureLabFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (readyPromise) return readyPromise;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = browserFontFaceCss();
    document.head.appendChild(style);
  }

  // Load latin + cyrillic for each weight (a mixed uk/latin probe string).
  const probe = 'ЯКЩО SPF ҐЄІЇ Aa';
  readyPromise = (async () => {
    try {
      await Promise.all(LAB_WEIGHTS.map((w) => document.fonts.load(`${w} 100px '${FONT_FAMILY}'`, probe)));
      await document.fonts.ready;
    } catch {
      /* fall through — layout still runs, just with fallback metrics */
    }
  })();
  return readyPromise;
}

// ── Export embedding ────────────────────────────────────────────────────────
let embeddedCssCache: string | null = null;

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

/**
 * Build a self-contained @font-face block with base64 woff2 data URIs, for
 * embedding into an SVG that will be rasterized as an <img> (font-isolated).
 * Cached after first build.
 */
export async function buildEmbeddedFontFaceCss(): Promise<string> {
  if (embeddedCssCache) return embeddedCssCache;
  const rules: string[] = [];
  for (const w of LAB_WEIGHTS) {
    for (const s of SUBSETS) {
      const b64 = await fetchAsBase64(faceUrl(w, s.name));
      if (!b64) continue;
      rules.push(
        `@font-face{font-family:'${FONT_FAMILY}';font-style:normal;font-weight:${w};` +
          `src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${s.range};}`,
      );
    }
  }
  embeddedCssCache = rules.join('');
  return embeddedCssCache;
}
