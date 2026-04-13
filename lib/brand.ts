export type BrandTheme = 'light' | 'dark';
export type BrandVibe = 'bold' | 'refined';

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
  titleFont: string;
  bodyFont: string;
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

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
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
  const accent1 = overrides?.accent1 ?? favHex;
  const h2 = vibe === 'bold' ? (h + 165) % 360 : (h + 30) % 360;
  const s2 = vibe === 'bold' ? Math.min(s + 10, 95) : Math.max(s - 15, 40);
  const accent2 = overrides?.accent2 ?? hslToHex(h2, s2, 45);

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

export function getFontsByVibe(vibe: BrandVibe): { titleFont: string; bodyFont: string } {
  return {
    titleFont: vibe === 'bold' ? 'Manrope' : 'Cormorant Garamond',
    bodyFont: 'Manrope',
  };
}
