import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import sharp from 'sharp';
import type { BrandAccentStyle } from '@/lib/brand';
import { normalizeAccentStyle } from '@/lib/brand';
import { parseAccentSpans } from '@/lib/carousel/accentSpans';
import {
  drawSegmentedLine,
  layoutWords,
  segmentsToWords,
  type CarouselFonts,
} from '@/lib/carousel/canvasSegmentedText';
import { ensureCarouselFonts } from '@/lib/carousel/carouselFonts';
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

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Configurable full-frame photo overlay matching the editor's ImageOverlays:
 * - `full`     → solid tint at the chosen opacity
 * - `gradient` → tint at the bottom fading to transparent ~60% up
 * - `backdrop`/`frost`/null → no full-frame wash (a text plate is drawn instead)
 */
function drawPhotoOverlay(
  ctx: SKRSContext2D,
  overlayType: GenerateSlideInput['overlay_type'],
  overlayColor: string,
  overlayOpacity: number,
): void {
  const oc = overlayColor || '#141414';
  const op = Math.max(0, Math.min(1, (overlayOpacity ?? 50) / 100));
  if (overlayType === 'full') {
    ctx.fillStyle = rgba(oc, op);
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  } else if (overlayType === 'gradient') {
    const grad = ctx.createLinearGradient(0, CANVAS_H, 0, 0);
    grad.addColorStop(0, rgba(oc, op));
    grad.addColorStop(0.6, rgba(oc, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  // backdrop / frost / null: handled by the text plate (or no overlay at all).
}

function fontSpec(fontSize: number, plainBaseIsBold: boolean, fonts: CarouselFonts): string {
  return plainBaseIsBold ? `${fontSize}px ${fonts.sansBold}` : `${fontSize}px ${fonts.sans}`;
}

/** Alphabetic baseline Y for the first line when the line box top is `topY` (matches former textBaseline: top layout). */
function firstAlphabeticBaseline(
  ctx: SKRSContext2D,
  fontSize: number,
  plainBaseIsBold: boolean,
  topY: number,
  fonts: CarouselFonts,
): number {
  ctx.font = fontSpec(fontSize, plainBaseIsBold, fonts);
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
  fonts: CarouselFonts,
): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const segments = parseAccentSpans(text);
  const words = segmentsToWords(segments);
  const measure = (t: string) => {
    ctx.font = fontSpec(fontSize, plainBaseIsBold, fonts);
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
  fonts: CarouselFonts,
): number {
  const trimmed = text.trim();
  if (!trimmed) return firstLineTopY;
  const segments = parseAccentSpans(text);
  const words = segmentsToWords(segments);
  const measure = (t: string) => {
    ctx.font = fontSpec(fontSize, plainBaseIsBold, fonts);
    return ctx.measureText(t).width;
  };
  const lines = layoutWords(measure, words, maxWidth);
  let baselineY = firstAlphabeticBaseline(ctx, fontSize, plainBaseIsBold, firstLineTopY, fonts);
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
      fonts,
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
  /** Exact px sizes (match the editor per slide type). Override title_size/body_size scaling when set. */
  title_px?: number;
  body_px?: number;
  /** Eyebrow/label pill (content slides) — rendered above the title like the editor. */
  label?: string | null;
  bg_photo_transform?: BgPhotoTransform | null;
  /** Configurable photo overlay (matches the editor). `null` = no overlay. */
  overlay_type?: 'full' | 'backdrop' | 'frost' | 'gradient' | null;
  overlay_color?: string;
  /** 0–100. Not used for `frost`. */
  overlay_opacity?: number;
};

function normalizeMultiline(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

export async function renderSlideImagePng(input: GenerateSlideInput): Promise<Buffer> {
  const fonts = ensureCarouselFonts(input.font_id);
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

      // Crop the resized image to the visible canvas window so sharp.composite
      // never receives a layer larger than the destination — otherwise it
      // throws "Image to composite must have same dimensions or smaller".
      const cropX = Math.max(0, -left);
      const cropY = Math.max(0, -top);
      const cropRight = Math.min(nextW, CANVAS_W - left);
      const cropBottom = Math.min(nextH, CANVAS_H - top);
      const cropW = Math.max(0, cropRight - cropX);
      const cropH = Math.max(0, cropBottom - cropY);
      const compositeLeft = Math.max(0, left);
      const compositeTop = Math.max(0, top);

      const layers: sharp.OverlayOptions[] = [];
      if (cropW > 0 && cropH > 0) {
        const visible =
          cropX === 0 && cropY === 0 && cropW === nextW && cropH === nextH
            ? resized
            : await sharp(resized)
                .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
                .png()
                .toBuffer();
        layers.push({ input: visible, left: compositeLeft, top: compositeTop });
      }

      const transformed = await sharp({
        create: {
          width: CANVAS_W,
          height: CANVAS_H,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .composite(layers)
        .png()
        .toBuffer();
      const img = await loadImage(transformed);
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
    } else {
      ctx.fillStyle = '#1A1A2E';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    // Configurable overlay (replaces the old hardcoded 55% black scrim).
    drawPhotoOverlay(ctx, input.overlay_type ?? 'full', input.overlay_color ?? '#141414', input.overlay_opacity ?? 50);
  }

  const titleSizePx =
    input.title_px ?? Math.round(TITLE_SIZE * TITLE_SCALE[input.title_size ?? 'L']);
  const bodySizePx =
    input.body_px ?? Math.round(BODY_SIZE * BODY_SCALE[input.body_size ?? 'M']);
  const titleLineHeight = Math.round(titleSizePx * 1.25);
  const bodyLineHeight = Math.round(bodySizePx * 1.25);
  const normalizedTitle = normalizeMultiline(input.title || '');
  const normalizedBody = normalizeMultiline(input.body || '');

  // drawSegmentedLine expects HEX (it runs hexToRgb internally). Passing an
  // `rgb(...)` string here produced NaN → black text on photos — the
  // near-invisible-title bug. Pass the hex straight through.
  const titleColorCss = input.title_color || '#FFFFFF';
  const bodyColorCss = input.body_color || '#FFFFFF';

  const titleBlockH = segmentedBlockHeight(
    ctx,
    normalizedTitle,
    MAX_TEXT_WIDTH,
    titleSizePx,
    titleLineHeight,
    true,
    fonts,
  );
  const bodyBlockH = segmentedBlockHeight(
    ctx,
    normalizedBody,
    MAX_TEXT_WIDTH,
    bodySizePx,
    bodyLineHeight,
    false,
    fonts,
  );

  const align = input.text_align ?? 'left';

  // Label pill (content slides) — matches the editor's rounded-full white-text
  // chip above the title. Included in the block so vertical placement centres it.
  const pillLabel = (input.label ?? '').trim();
  const PILL_TEXT = 22;
  const PILL_PAD_X = 20;
  const PILL_H = pillLabel ? 40 : 0;
  const PILL_GAP = pillLabel ? 32 : 0; // mt-8 to the title

  const betweenGap = titleBlockH && bodyBlockH ? TITLE_BODY_GAP : 0;
  const textBlockHeight = PILL_H + PILL_GAP + titleBlockH + betweenGap + bodyBlockH;

  let textBlockY: number;
  if (input.placement === 'center') {
    textBlockY = Math.round((CANVAS_H - textBlockHeight) / 2);
  } else if (input.placement === 'top') {
    textBlockY = 100;
  } else {
    textBlockY = CANVAS_H - textBlockHeight - 100;
  }

  // Backdrop / frost text plate behind the text block (matches the editor's
  // TextPanelChrome). Only for photo backgrounds with backdrop/frost overlay.
  if (
    input.background_type === 'image' &&
    (input.overlay_type === 'backdrop' || input.overlay_type === 'frost') &&
    textBlockHeight > 0
  ) {
    const panelPadX = 28;
    const panelPadY = 24;
    const oc = input.overlay_color || '#141414';
    const op = Math.max(0, Math.min(1, (input.overlay_opacity ?? 50) / 100));
    const panelAlpha = input.overlay_type === 'backdrop' ? op : Math.max(0.18, op * 0.45);
    const panelX = MARGIN_X - panelPadX;
    const panelW = CANVAS_W - 2 * (MARGIN_X - panelPadX);
    const panelY = textBlockY - panelPadY;
    const panelH = textBlockHeight + panelPadY * 2;
    ctx.fillStyle = rgba(oc, panelAlpha);
    roundRect(ctx, panelX, panelY, panelW, panelH, 28);
    ctx.fill();
  }

  let nextTopY = textBlockY;
  if (pillLabel) {
    ctx.font = `${PILL_TEXT}px ${fonts.sansBold}`;
    const textW = ctx.measureText(pillLabel).width;
    const pillW = PILL_PAD_X * 2 + textW;
    const pillX =
      align === 'right'
        ? MARGIN_X + MAX_TEXT_WIDTH - pillW
        : align === 'center'
          ? MARGIN_X + (MAX_TEXT_WIDTH - pillW) / 2
          : MARGIN_X;
    const { r, g, b } = hexToRgb(accentColor);
    roundRect(ctx, pillX, nextTopY, pillW, PILL_H, PILL_H / 2);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(pillLabel, pillX + PILL_PAD_X, nextTopY + PILL_H / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    nextTopY += PILL_H + PILL_GAP;
  }
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
    fonts,
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
    fonts,
  );

  return canvas.toBuffer('image/png');
}
