import { join } from 'path';
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import sharp from 'sharp';

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

function wrapLines(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number
): { lines: string[]; height: number } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { lines: [], height: 0 };
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const height = Math.max(lines.length, 1) * lineHeight;
  return { lines, height };
}

export type GenerateSlideInput = {
  title: string;
  body: string;
  placement: 'top' | 'center' | 'bottom';
  background_type: 'color' | 'image';
  background_color: string;
  background_image_url: string | null;
  /** Raw base64 without data URL prefix — used when URL is not available */
  background_image_base64?: string | null;
  title_color: string;
  body_color: string;
  slide_index: number;
  total_slides: number;
};

export async function renderSlideImagePng(input: GenerateSlideInput): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(CANVAS, CANVAS);
  const ctx = canvas.getContext('2d');

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

  const titleFont = fontsRegistered ? `${TITLE_SIZE}px NotoSansBold` : `bold ${TITLE_SIZE}px sans-serif`;
  const bodyFont = fontsRegistered ? `${BODY_SIZE}px NotoSans` : `${BODY_SIZE}px sans-serif`;
  const titleLineHeight = Math.round(TITLE_SIZE * 1.25);
  const bodyLineHeight = Math.round(BODY_SIZE * 1.25);

  ctx.font = titleFont;
  const tc = hexToRgb(input.title_color || '#FFFFFF');
  ctx.fillStyle = `rgb(${tc.r},${tc.g},${tc.b})`;
  const titleWrap = wrapLines(ctx, input.title || '', MAX_TEXT_WIDTH, titleLineHeight);

  ctx.font = bodyFont;
  const bc = hexToRgb(input.body_color || '#FFFFFF');
  ctx.fillStyle = `rgb(${bc.r},${bc.g},${bc.b})`;
  const bodyWrap = wrapLines(ctx, input.body || '', MAX_TEXT_WIDTH, bodyLineHeight);

  const titleBlockH = titleWrap.lines.length ? titleWrap.height : 0;
  const bodyBlockH = bodyWrap.lines.length ? bodyWrap.height : 0;
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

  ctx.textBaseline = 'top';
  let y = textBlockY;
  ctx.font = titleFont;
  ctx.fillStyle = `rgb(${tc.r},${tc.g},${tc.b})`;
  for (const line of titleWrap.lines) {
    ctx.fillText(line, MARGIN_X, y);
    y += titleLineHeight;
  }
  if (titleWrap.lines.length && bodyWrap.lines.length) {
    y += TITLE_BODY_GAP;
  }
  ctx.font = bodyFont;
  ctx.fillStyle = `rgb(${bc.r},${bc.g},${bc.b})`;
  for (const line of bodyWrap.lines) {
    ctx.fillText(line, MARGIN_X, y);
    y += bodyLineHeight;
  }

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
