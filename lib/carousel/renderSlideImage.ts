import { join } from 'path';
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import sharp from 'sharp';
import type { BrandAccentStyle } from '@/lib/brand';
import { normalizeAccentStyle } from '@/lib/brand';
import { parseAccentSpans } from '@/lib/carousel/accentSpans';
import {
  drawSegmentedLine,
  layoutWords,
  segmentsToWords,
} from '@/lib/carousel/canvasSegmentedText';

const CANVAS = 1080;
const MARGIN_X = 100;
const MAX_TEXT_WIDTH = 880;
const TITLE_SIZE = 72;
const BODY_SIZE = 44;
const TITLE_BODY_GAP = 32;
const SLIDE_NUM_SIZE = 32;

let fontsRegistered = false;

function ensureFonts() {
  if (fontsRegistered) return;
  const fontDir = join(process.cwd(), 'public', 'fonts');
  try {
    GlobalFonts.registerFromPath(join(fontDir, 'NotoSans-Bold.ttf'), 'NotoSansBold');
    GlobalFonts.registerFromPath(join(fontDir, 'NotoSans-Regular.ttf'), 'NotoSans');
    GlobalFonts.registerFromPath(join(fontDir, 'NotoSans-Italic.ttf'), 'NotoSansItalic');
    fontsRegistered = true;
  } catch (e) {
    console.warn('[carousel] Failed to register Noto fonts:', e);
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function fontSpec(fontSize: number, plainBaseIsBold: boolean): string {
  return plainBaseIsBold ? `${fontSize}px NotoSansBold` : `${fontSize}px NotoSans`;
}

/** Alphabetic baseline Y for the first line when the line box top is `topY` (matches former textBaseline: top layout). */
function firstAlphabeticBaseline(
  ctx: SKRSContext2D,
  fontSize: number,
  plainBaseIsBold: boolean,
  topY: number,
): number {
  ctx.font = fontSpec(fontSize, plainBaseIsBold);
  const m = ctx.measureText('Mg');
  const ascent =
    typeof m.actualBoundingBoxAscent === 'number' && m.actualBoundingBoxAscent > 0
      ? m.actualBoundingBoxAscent
      : fontSize * 0.72;
  return topY + ascent;
}

function segmentedBlockHeight(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  plainBaseIsBold: boolean,
): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const segments = parseAccentSpans(text);
  const words = segmentsToWords(segments);
  const measure = (t: string) => {
    ctx.font = fontSpec(fontSize, plainBaseIsBold);
    return ctx.measureText(t).width;
  };
  const lines = layoutWords(measure, words, maxWidth);
  return Math.max(lines.length, 1) * lineHeight;
}

function drawSegmentedBlock(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  /** Y of the top of the first line (same as legacy `textBaseline: 'top'`). */
  firstLineTopY: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  baseColor: string,
  accentColor: string,
  accentStyle: BrandAccentStyle,
  align: 'left' | 'center' | 'right',
  plainBaseIsBold: boolean,
  seed: number,
): number {
  const trimmed = text.trim();
  if (!trimmed) return firstLineTopY;
  const segments = parseAccentSpans(text);
  const words = segmentsToWords(segments);
  const measure = (t: string) => {
    ctx.font = fontSpec(fontSize, plainBaseIsBold);
    return ctx.measureText(t).width;
  };
  const lines = layoutWords(measure, words, maxWidth);
  let baselineY = firstAlphabeticBaseline(ctx, fontSize, plainBaseIsBold, firstLineTopY);
  let i = 0;
  for (const line of lines) {
    drawSegmentedLine(
      ctx,
      line,
      x,
      baselineY,
      fontSize,
      baseColor,
      accentColor,
      accentStyle,
      align,
      maxWidth,
      false,
      seed + i * 31,
      plainBaseIsBold,
    );
    baselineY += lineHeight;
    i++;
  }
  return firstLineTopY + Math.max(lines.length, 1) * lineHeight;
}

export type GenerateSlideInput = {
  title: string;
  body: string;
  placement: 'top' | 'center' | 'bottom';
  text_align: 'left' | 'center' | 'right';
  background_type: 'color' | 'image';
  background_color: string;
  background_image_url: string | null;
  /** Raw base64 without data URL prefix — used when URL is not available */
  background_image_base64?: string | null;
  title_color: string;
  body_color: string;
  slide_index: number;
  total_slides: number;
  /** Brand DNA accent for `{…}` spans (legacy renderer). */
  accent_color?: string;
  accent_style?: BrandAccentStyle;
};

export async function renderSlideImagePng(input: GenerateSlideInput): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(CANVAS, CANVAS);
  const ctx = canvas.getContext('2d');

  const accentColor = input.accent_color?.trim() || '#e05c40';
  const accentStyle = normalizeAccentStyle(input.accent_style);

  if (input.background_type === 'color') {
    const { r, g, b } = hexToRgb(input.background_color || '#1A1A2E');
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, CANVAS, CANVAS);
  } else {
    let buf: Buffer | null = null;
    try {
      if (input.background_image_base64) {
        buf = Buffer.from(input.background_image_base64, 'base64');
      } else if (input.background_image_url) {
        const u = input.background_image_url.trim();
        if (u.startsWith('data:')) {
          const m = u.match(/^data:image\/\w+;base64,(.+)$/);
          if (m) buf = Buffer.from(m[1], 'base64');
        } else {
          const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
          if (!res.ok) throw new Error(`Image fetch ${res.status}`);
          buf = Buffer.from(await res.arrayBuffer());
        }
      }
    } catch (e) {
      console.warn('[carousel] Background image failed, using solid fallback:', e);
    }
    if (buf) {
      const resized = await sharp(buf)
        .resize(CANVAS, CANVAS, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();
      const img = await loadImage(resized);
      ctx.drawImage(img, 0, 0, CANVAS, CANVAS);
    } else {
      ctx.fillStyle = '#1A1A2E';
      ctx.fillRect(0, 0, CANVAS, CANVAS);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, CANVAS, CANVAS);
  }

  const titleLineHeight = Math.round(TITLE_SIZE * 1.25);
  const bodyLineHeight = Math.round(BODY_SIZE * 1.25);

  const tc = hexToRgb(input.title_color || '#FFFFFF');
  const bc = hexToRgb(input.body_color || '#FFFFFF');
  const titleColorCss = `rgb(${tc.r},${tc.g},${tc.b})`;
  const bodyColorCss = `rgb(${bc.r},${bc.g},${bc.b})`;

  const titleBlockH = segmentedBlockHeight(
    ctx,
    input.title || '',
    MAX_TEXT_WIDTH,
    TITLE_SIZE,
    titleLineHeight,
    true,
  );
  const bodyBlockH = segmentedBlockHeight(
    ctx,
    input.body || '',
    MAX_TEXT_WIDTH,
    BODY_SIZE,
    bodyLineHeight,
    false,
  );

  const betweenGap = titleBlockH && bodyBlockH ? TITLE_BODY_GAP : 0;
  const textBlockHeight = titleBlockH + betweenGap + bodyBlockH;

  let textBlockY: number;
  if (input.placement === 'center') {
    textBlockY = Math.round((CANVAS - textBlockHeight) / 2);
  } else if (input.placement === 'top') {
    textBlockY = 100;
  } else {
    textBlockY = CANVAS - textBlockHeight - 100;
  }

  const align = input.text_align ?? 'left';

  let nextTopY = textBlockY;
  nextTopY = drawSegmentedBlock(
    ctx,
    input.title || '',
    MARGIN_X,
    nextTopY,
    MAX_TEXT_WIDTH,
    TITLE_SIZE,
    titleLineHeight,
    titleColorCss,
    accentColor,
    accentStyle,
    align,
    true,
    100,
  );
  if (titleBlockH && bodyBlockH) {
    nextTopY += TITLE_BODY_GAP;
  }
  drawSegmentedBlock(
    ctx,
    input.body || '',
    MARGIN_X,
    nextTopY,
    MAX_TEXT_WIDTH,
    BODY_SIZE,
    bodyLineHeight,
    bodyColorCss,
    accentColor,
    accentStyle,
    align,
    false,
    300,
  );

  const slideLabel = `${input.slide_index} / ${input.total_slides}`;
  ctx.textBaseline = 'alphabetic';
  ctx.font = fontsRegistered ? `${SLIDE_NUM_SIZE}px NotoSans` : `${SLIDE_NUM_SIZE}px sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  const w = ctx.measureText(slideLabel).width;
  const numX = 980 - w;
  const numY = 1040;
  ctx.fillText(slideLabel, numX, numY);

  return canvas.toBuffer('image/png');
}
