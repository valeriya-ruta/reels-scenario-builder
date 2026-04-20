export type BrandTheme = 'light' | 'dark';
export type BrandVibe = 'bold' | 'refined';

/** Inline accent rendering for carousel text `{…}` (matches Pillow / Brand DNA). */
export type BrandAccentStyle = 'bold' | 'italic' | 'pill' | 'rectangle' | 'marker';

export function normalizeAccentStyle(value: unknown): BrandAccentStyle {
  if (
    value === 'bold' ||
    value === 'italic' ||
    value === 'pill' ||
    value === 'rectangle' ||
    value === 'marker'
  ) {
    return value;
  }
  return 'marker';
}

export interface BrandPalette {
  lightBg: string;
  darkBg: string;
  accent1: string;
  accent2: string;
}

export interface BrandComputedPalette extends BrandPalette {
  bg: string;
  mainText: string;
  accent1Safe: string;
  accent2Safe: string;
}

export interface BrandSettings {
  theme: BrandTheme;
  vibe: BrandVibe;
  favColorHex: string;
  colors: BrandPalette;
  fontId: string;
  /** How `{accent}` spans are styled in editors and renders. */
  accentStyle: BrandAccentStyle;
}

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

function toHex(x: number): string {
  const v = Math.round(x).toString(16).padStart(2, '0');
  return v.toUpperCase();
}

export function normalizeHex(color: string): string {
  const raw = color.trim().replace(/^#/, '');
  if (raw.length === 3) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toUpperCase();
  }
  if (raw.length >= 6) {
    return `#${raw.slice(0, 6)}`.toUpperCase();
  }
  return '#000000';
}

function hexToRgb(hex: string): [number, number, number] {
  const safe = normalizeHex(hex).slice(1);
  return [
    parseInt(safe.slice(0, 2), 16),
    parseInt(safe.slice(2, 4), 16),
    parseInt(safe.slice(4, 6), 16),
  ];
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      default:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }

  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return `#${toHex((r + m) * 255)}${toHex((g + m) * 255)}${toHex((b + m) * 255)}`;
}

function linearize(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const rl = linearize(r);
  const gl = linearize(g);
  const bl = linearize(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA against both page backgrounds (carousel / Brand preview use light + dark). */
export function ensureContrastAgainstBothBackgrounds(
  fg: string,
  lightBg: string,
  darkBg: string,
  target = 4.5,
): string {
  const [h0, s0] = hexToHsl(normalizeHex(fg));
  let bestHex = normalizeHex(fg);
  let bestMin = Math.min(contrastRatio(bestHex, lightBg), contrastRatio(bestHex, darkBg));

  const consider = (hex: string) => {
    const m = Math.min(contrastRatio(hex, lightBg), contrastRatio(hex, darkBg));
    if (m > bestMin) {
      bestMin = m;
      bestHex = normalizeHex(hex);
    }
  };

  for (let s = Math.max(5, s0 - 30); s <= Math.min(100, s0 + 30); s += 2) {
    for (let l = 6; l <= 94; l += 1) {
      consider(hslToHex(h0, s, l));
    }
  }
  if (bestMin >= target) {
    return bestHex;
  }

  for (let dh = -24; dh <= 24; dh += 6) {
    const h = (h0 + dh + 360) % 360;
    for (let s = 15; s <= 100; s += 5) {
      for (let l = 6; l <= 94; l += 2) {
        consider(hslToHex(h, s, l));
      }
    }
  }

  return bestHex;
}

export function minContrastOnBothBackgrounds(fg: string, lightBg: string, darkBg: string): number {
  const hex = normalizeHex(fg);
  return Math.min(contrastRatio(hex, lightBg), contrastRatio(hex, darkBg));
}

/** Number of harmonic accent2 recipes (secondary brand color, not the favorite / accent1). */
export const ACCENT2_VARIANT_COUNT = 6;

/**
 * Secondary accent (accent2) relative to the first accent (accent1).
 * - refined: complementary harmony — split/true complements, softer chroma (elegant pairs).
 * - bold: strong opposites — hue opposition + triadic punch (modern / high contrast).
 */
export function getAccent2VariantRawHex(
  accent1HexInput: string,
  vibe: BrandVibe,
  variantIndex: number,
): string {
  const accent1 = normalizeHex(accent1HexInput);
  const [h, s] = hexToHsl(accent1);
  const i = ((variantIndex % ACCENT2_VARIANT_COUNT) + ACCENT2_VARIANT_COUNT) % ACCENT2_VARIANT_COUNT;

  if (vibe === 'refined') {
    switch (i) {
      case 0:
        return hslToHex((h + 180) % 360, Math.max(s - 14, 28), 48);
      case 1:
        return hslToHex((h + 150) % 360, Math.max(s - 10, 34), 46);
      case 2:
        return hslToHex((h + 210) % 360, Math.max(s - 10, 34), 47);
      case 3:
        return hslToHex((h + 165) % 360, Math.max(s - 12, 32), 49);
      case 4:
        return hslToHex((h + 195) % 360, Math.max(s - 12, 32), 49);
      case 5:
        return hslToHex((h + 180) % 360, Math.max(s - 18, 26), 44);
      default:
        return hslToHex((h + 180) % 360, Math.max(s - 14, 28), 48);
    }
  }

  switch (i) {
    case 0:
      return hslToHex((h + 180) % 360, Math.min(s + 20, 100), 43);
    case 1:
      return hslToHex((h + 175) % 360, Math.min(s + 18, 98), 42);
    case 2:
      return hslToHex((h + 185) % 360, Math.min(s + 18, 98), 42);
    case 3:
      return hslToHex((h + 120) % 360, Math.min(s + 14, 96), 46);
    case 4:
      return hslToHex((h + 240) % 360, Math.min(s + 14, 96), 46);
    case 5:
      return hslToHex((h + 180) % 360, Math.min(s + 24, 100), 38);
    default:
      return hslToHex((h + 180) % 360, Math.min(s + 20, 100), 43);
  }
}

/**
 * Cycles accent2 variants; skips recipes that cannot meet AA on both backgrounds after adjustment.
 */
export function pickNextAccent2Variant(
  accent1Hex: string,
  vibe: BrandVibe,
  lightBg: string,
  darkBg: string,
  previousVariantIndex: number,
): { accent2: string; variantIndex: number } {
  const start = (previousVariantIndex + 1) % ACCENT2_VARIANT_COUNT;

  for (let t = 0; t < ACCENT2_VARIANT_COUNT; t++) {
    const variantIndex = (start + t) % ACCENT2_VARIANT_COUNT;
    const raw = getAccent2VariantRawHex(accent1Hex, vibe, variantIndex);
    const adjusted = ensureContrastAgainstBothBackgrounds(raw, lightBg, darkBg, 4.5);
    if (minContrastOnBothBackgrounds(adjusted, lightBg, darkBg) >= 4.5) {
      return { accent2: adjusted, variantIndex };
    }
  }

  const fallbackIdx = start;
  const raw = getAccent2VariantRawHex(accent1Hex, vibe, fallbackIdx);
  const adjusted = ensureContrastAgainstBothBackgrounds(raw, lightBg, darkBg, 4.5);
  return { accent2: adjusted, variantIndex: fallbackIdx };
}

export function ensureContrast(fg: string, bg: string, target: number): string {
  const [h, s, initialL] = hexToHsl(fg);
  let l = initialL;
  const bgLum = luminance(bg);
  let attempts = 0;
  while (contrastRatio(hslToHex(h, s, l), bg) < target && attempts < 80) {
    l = bgLum > 0.5 ? Math.max(0, l - 2) : Math.min(100, l + 2);
    attempts += 1;
  }
  return hslToHex(h, s, l);
}

export function computeBrandPalette(
  favHexInput: string,
  theme: BrandTheme,
  vibe: BrandVibe,
  overrides?: Partial<BrandPalette>,
): BrandComputedPalette {
  const favHex = normalizeHex(favHexInput);
  const [h, s] = hexToHsl(favHex);
  const lightBg = overrides?.lightBg ?? hslToHex(h, 18, 97);
  const darkBg = overrides?.darkBg ?? hslToHex(h, 30, 8);
  const accent1 = normalizeHex(overrides?.accent1 ?? favHex);
  const accent2 =
    overrides?.accent2 ?? getAccent2VariantRawHex(accent1, vibe, 0);

  const bg = theme === 'light' ? lightBg : darkBg;
  const mainText = theme === 'light' ? darkBg : lightBg;
  const accent1Safe = ensureContrast(accent1, bg, 4.5);
  const accent2Safe = ensureContrast(accent2, bg, 3);

  return {
    lightBg,
    darkBg,
    accent1,
    accent2,
    bg,
    mainText,
    accent1Safe,
    accent2Safe,
  };
}

