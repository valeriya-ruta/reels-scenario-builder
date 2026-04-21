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
import { getBgPhotoTransform, type BgPhotoTransform } from '@/lib/carousel/bgPhotoTransform';

const CANVAS_W = 1080;
const CANVAS_H = 1350;
const MARGIN_X = 100;
const MAX_TEXT_WIDTH = 880;
const TITLE_SIZE = 72;
const BODY_SIZE = 44;
const TITLE_BODY_GAP = 32;
const TITLE_SCALE: Record<'L' | 'M', number> = { L: 1, M: 0.8 };
const BODY_SCALE: Record<'M' | 'S', number> = { M: 1, S: 0.8 };

let fontsRegistered = false;
let activeFontId: string | null = null;

function ensureFonts(fontId?: string | null) {
  const fontDir = join(process.cwd(), 'public', 'fonts');
  const requestedFontId = (fontId ?? '').trim().toLowerCase();
  const fontsourceDir = join(process.cwd(), 'node_modules', '@fontsource');

  if (fontsRegistered && activeFontId === requestedFontId) return;
  try {
    GlobalFonts.registerFromPath(join(fontDir, 'NotoSans-Bold.ttf'), 'NotoSansBold');
    GlobalFonts.registerFromPath(join(fontDir, 'NotoSans-Regular.ttf'), 'NotoSans');
    GlobalFonts.registerFromPath(join(fontDir, 'NotoSans-Italic.ttf'), 'NotoSansItalic');
    // Override aliases with the selected Brand DNA font so downloaded PNGs match preview typography.
    if (requestedFontId === 'google_sans') {
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'google-sans', 'files', 'google-sans-cyrillic-700-normal.woff'),
        'NotoSansBold',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'google-sans', 'files', 'google-sans-cyrillic-400-normal.woff'),
        'NotoSans',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'google-sans', 'files', 'google-sans-cyrillic-400-italic.woff'),
        'NotoSansItalic',
      );
    } else if (requestedFontId === 'manrope') {
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'manrope', 'files', 'manrope-cyrillic-700-normal.woff'),
        'NotoSansBold',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'manrope', 'files', 'manrope-cyrillic-400-normal.woff'),
        'NotoSans',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'manrope', 'files', 'manrope-cyrillic-400-normal.woff'),
        'NotoSansItalic',
      );
    } else if (requestedFontId === 'cormorant') {
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'cormorant-garamond', 'files', 'cormorant-garamond-cyrillic-700-normal.woff'),
        'NotoSansBold',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'cormorant-garamond', 'files', 'cormorant-garamond-cyrillic-400-normal.woff'),
        'NotoSans',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'cormorant-garamond', 'files', 'cormorant-garamond-cyrillic-400-italic.woff'),
        'NotoSansItalic',
      );
    } else if (requestedFontId === 'days_one') {
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'days-one', 'files', 'days-one-cyrillic-400-normal.woff'),
        'NotoSansBold',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'days-one', 'files', 'days-one-cyrillic-400-normal.woff'),
        'NotoSans',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'days-one', 'files', 'days-one-cyrillic-400-normal.woff'),
        'NotoSansItalic',
      );
    } else if (requestedFontId === 'climate_crisis') {
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'climate-crisis', 'files', 'climate-crisis-cyrillic-400-normal.woff'),
        'NotoSansBold',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'climate-crisis', 'files', 'climate-crisis-cyrillic-400-normal.woff'),
        'NotoSans',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'climate-crisis', 'files', 'climate-crisis-cyrillic-400-normal.woff'),
        'NotoSansItalic',
      );
    } else if (requestedFontId === 'inter') {
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'inter', 'files', 'inter-cyrillic-700-normal.woff'),
        'NotoSansBold',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'inter', 'files', 'inter-cyrillic-400-normal.woff'),
        'NotoSans',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'inter', 'files', 'inter-cyrillic-400-italic.woff'),
        'NotoSansItalic',
      );
    } else if (requestedFontId === 'montserrat') {
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'montserrat', 'files', 'montserrat-cyrillic-700-normal.woff'),
        'NotoSansBold',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'montserrat', 'files', 'montserrat-cyrillic-400-normal.woff'),
        'NotoSans',
      );
      GlobalFonts.registerFromPath(
        join(fontsourceDir, 'montserrat', 'files', 'montserrat-cyrillic-400-italic.woff'),
        'NotoSansItalic',
      );
    }
    fontsRegistered = true;
    activeFontId = requestedFontId;
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
  background_type: 'color' | 'gradient' | 'image';
  background_color: string;
  gradient_mid_color?: string | null;
  gradient_end_color?: string | null;
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
  font_id?: string | null;
  title_size?: 'L' | 'M';
  body_size?: 'M' | 'S';
  bg_photo_transform?: BgPhotoTransform | null;
};

function normalizeMultiline(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

export async function renderSlideImagePng(input: GenerateSlideInput): Promise<Buffer> {
  ensureFonts(input.font_id);
  const canvas = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = canvas.getContext('2d');

  const accentColor = input.accent_color?.trim() || '#e05c40';
  const accentStyle = normalizeAccentStyle(input.accent_style);

  if (input.background_type === 'color' || input.background_type === 'gradient') {
    const { r, g, b } = hexToRgb(input.background_color || '#1A1A2E');
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (input.background_type === 'gradient') {
      const midColor = input.gradient_mid_color?.trim() || input.accent_color || '#D6B58A';
      const endColor = input.gradient_end_color?.trim() || '#1A1A2E';
      const g = ctx.createRadialGradient(CANVAS_W * 0.3, CANVAS_H * 0.3, 0, CANVAS_W * 0.3, CANVAS_H * 0.3, CANVAS_H);
      g.addColorStop(0, input.background_color || '#F5F2ED');
      g.addColorStop(0.6, midColor);
      g.addColorStop(1, endColor);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
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
      const oriented = sharp(buf).rotate();
      const meta = await oriented.metadata();
      const srcW = meta.width ?? CANVAS_W;
      const srcH = meta.height ?? CANVAS_H;
      const transform = getBgPhotoTransform(input.bg_photo_transform ?? undefined);
      const coverScale = Math.max(CANVAS_W / srcW, CANVAS_H / srcH);
      const finalScale = Math.max(0.01, coverScale * transform.scale);
      const nextW = Math.max(1, Math.round(srcW * finalScale));
      const nextH = Math.max(1, Math.round(srcH * finalScale));
      const offsetPxX = transform.offset_x * CANVAS_W;
      const offsetPxY = transform.offset_y * CANVAS_H;
      const left = Math.round((CANVAS_W - nextW) / 2 + offsetPxX);
      const top = Math.round((CANVAS_H - nextH) / 2 + offsetPxY);

      const resized = await oriented.resize(nextW, nextH, { fit: 'fill' }).png().toBuffer();
      const transformed = await sharp({
        create: {
          width: CANVAS_W,
          height: CANVAS_H,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .composite([{ input: resized, left, top }])
        .png()
        .toBuffer();
      const img = await loadImage(transformed);
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
    } else {
      ctx.fillStyle = '#1A1A2E';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  const titleSizePx = Math.round(TITLE_SIZE * TITLE_SCALE[input.title_size ?? 'L']);
  const bodySizePx = Math.round(BODY_SIZE * BODY_SCALE[input.body_size ?? 'M']);
  const titleLineHeight = Math.round(titleSizePx * 1.25);
  const bodyLineHeight = Math.round(bodySizePx * 1.25);
  const normalizedTitle = normalizeMultiline(input.title || '');
  const normalizedBody = normalizeMultiline(input.body || '');

  const tc = hexToRgb(input.title_color || '#FFFFFF');
  const bc = hexToRgb(input.body_color || '#FFFFFF');
  const titleColorCss = `rgb(${tc.r},${tc.g},${tc.b})`;
  const bodyColorCss = `rgb(${bc.r},${bc.g},${bc.b})`;

  const titleBlockH = segmentedBlockHeight(
    ctx,
    normalizedTitle,
    MAX_TEXT_WIDTH,
    titleSizePx,
    titleLineHeight,
    true,
  );
  const bodyBlockH = segmentedBlockHeight(
    ctx,
    normalizedBody,
    MAX_TEXT_WIDTH,
    bodySizePx,
    bodyLineHeight,
    false,
  );

  const betweenGap = titleBlockH && bodyBlockH ? TITLE_BODY_GAP : 0;
  const textBlockHeight = titleBlockH + betweenGap + bodyBlockH;

  let textBlockY: number;
  if (input.placement === 'center') {
    textBlockY = Math.round((CANVAS_H - textBlockHeight) / 2);
  } else if (input.placement === 'top') {
    textBlockY = 100;
  } else {
    textBlockY = CANVAS_H - textBlockHeight - 100;
  }

  const align = input.text_align ?? 'left';

  let nextTopY = textBlockY;
  nextTopY = drawSegmentedBlock(
    ctx,
    normalizedTitle,
    MARGIN_X,
    nextTopY,
    MAX_TEXT_WIDTH,
    titleSizePx,
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
    normalizedBody,
    MARGIN_X,
    nextTopY,
    MAX_TEXT_WIDTH,
    bodySizePx,
    bodyLineHeight,
    bodyColorCss,
    accentColor,
    accentStyle,
    align,
    false,
    300,
  );

  return canvas.toBuffer('image/png');
}
