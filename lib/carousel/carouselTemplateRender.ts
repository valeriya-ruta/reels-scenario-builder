import { join } from 'path';
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D, type Image } from '@napi-rs/canvas';
import {
  CANVAS_SIZE,
  PADDING,
  WATERMARK_Y,
  DOT_BOTTOM_Y,
  DEFAULT_BG,
  DEFAULT_DARK,
  DEFAULT_ACCENT,
  DEFAULT_CREAM,
  type BrandDnaForRender,
  type SlideTemplateKind,
} from '@/lib/carousel/carouselConstants';
import { parseAccentSpans, stripAccentMarkers } from '@/lib/carousel/accentSpans';
import {
  drawSegmentedLine,
  layoutWords,
  roundRectPath,
  segmentsToWords,
} from '@/lib/carousel/canvasSegmentedText';
import { rasterizePhosphorIcon } from '@/lib/carousel/phosphorIcon';
import type { BrandAccentStyle } from '@/lib/brand';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');

let fontsReady = false;

function ensureCarouselFonts(): void {
  if (fontsReady) return;
  try {
    GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSans-Bold.ttf'), 'NotoSansBold');
    GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSans-Regular.ttf'), 'NotoSans');
    GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSans-Italic.ttf'), 'NotoSansItalic');
    GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSerif-Italic.ttf'), 'NotoSerifItalic');
    fontsReady = true;
  } catch (e) {
    console.warn('[carousel] font registration:', e);
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
      : h.slice(0, 6);
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function drawParagraphSegmented(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  yStart: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  baseColor: string,
  accentColor: string,
  accentStyle: BrandAccentStyle,
  align: 'left' | 'center' | 'right',
  refinedNoAccent: boolean,
  seed: number,
): number {
  const segments = parseAccentSpans(text);
  const words = segmentsToWords(segments);
  const measurePlain = (t: string) => {
    ctx.font = `${fontSize}px NotoSans`;
    return ctx.measureText(t).width;
  };
  const lines = layoutWords(measurePlain, words, maxWidth);
  let y = yStart;
  let i = 0;
  for (const line of lines) {
    drawSegmentedLine(
      ctx,
      line,
      x,
      y,
      fontSize,
      baseColor,
      accentColor,
      accentStyle,
      align,
      maxWidth,
      refinedNoAccent,
      seed + i * 31,
    );
    y += lineHeight;
    i++;
  }
  return y;
}

function drawPlainParagraph(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  yStart: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  color: string,
  align: 'left' | 'center' | 'right',
  fontFamily: 'sans' | 'serif' | 'sansBold' = 'sans',
): number {
  const trimmed = text.trim();
  if (!trimmed) return yStart;
  const fontFace =
    fontFamily === 'serif'
      ? `italic ${fontSize}px NotoSerifItalic`
      : fontFamily === 'sansBold'
        ? `bold ${fontSize}px NotoSansBold`
        : `${fontSize}px NotoSans`;
  ctx.font = fontFace;
  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  let y = yStart;
  for (const ln of lines) {
    const w = ctx.measureText(ln).width;
    let lx = x;
    if (align === 'center') lx = x + (maxWidth - w) / 2;
    if (align === 'right') lx = x + maxWidth - w;
    const { r, g, b } = hexToRgb(color);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ln, lx, y);
    y += lineHeight;
  }
  return y;
}

function splitEditorialTitle(title: string): [string, string] {
  const t = title.trim();
  if (!t) return ['', ''];
  const nl = t.indexOf('\n');
  if (nl > 0) return [t.slice(0, nl).trim(), t.slice(nl + 1).trim()];
  const em = t.split(/\s+—\s+/);
  if (em.length >= 2) return [em[0], em.slice(1).join(' — ')];
  const words = t.split(/\s+/);
  if (words.length <= 3) return [t, ''];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

function drawWatermark(
  ctx: SKRSContext2D,
  handle: string,
  domain: string,
  vibe: 'bold' | 'refined',
  lightText: boolean,
) {
  const h = handle.trim() || '';
  const d = domain.trim() || '';
  const size = vibe === 'refined' ? 22 : 24;
  ctx.font = `${size}px NotoSans`;
  ctx.fillStyle = lightText ? 'rgba(255,255,255,0.55)' : 'rgba(150,150,150,0.6)';
  ctx.textBaseline = 'alphabetic';
  if (vibe === 'refined') {
    if (h) ctx.fillText(h, PADDING, WATERMARK_Y);
    if (d) {
      const tw = ctx.measureText(d).width;
      ctx.fillText(d, CANVAS_SIZE - PADDING - tw, WATERMARK_Y);
    }
  } else {
    const t = h || d || '';
    if (t) {
      const tw = ctx.measureText(t).width;
      ctx.fillText(t, (CANVAS_SIZE - tw) / 2, WATERMARK_Y);
    }
  }
}

function drawProgressDots(
  ctx: SKRSContext2D,
  slideIndex: number,
  totalSlides: number,
  accentColor: string,
  lightOnDark: boolean,
) {
  const n = totalSlides;
  const d = 14;
  const gap = 10;
  const totalW = n * d + (n - 1) * gap;
  let x0 = (CANVAS_SIZE - totalW) / 2;
  const y = CANVAS_SIZE - DOT_BOTTOM_Y - d / 2;
  const inactive = lightOnDark ? 'rgba(255,255,255,0.35)' : 'rgba(200,200,200,0.5)';
  const { r, g, b } = hexToRgb(accentColor);
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x0 + d / 2, y, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = i === slideIndex - 1 ? `rgb(${r},${g},${b})` : inactive;
    ctx.fill();
    x0 += d + gap;
  }
}

export type CarouselTemplateInput = {
  slideKind: SlideTemplateKind;
  title: string;
  body: string;
  label: string | null;
  items: string[] | null;
  icon: string | null;
  designNote: string | null;
  slideIndex: number;
  totalSlides: number;
  brand: BrandDnaForRender;
  handle: string;
  domain: string;
};

async function renderCover(
  ctx: SKRSContext2D,
  input: CarouselTemplateInput,
  refined: boolean,
): Promise<void> {
  const { brand, handle, domain, title, body, label, designNote } = input;
  const accent = brand.accentColor || DEFAULT_ACCENT;
  if (refined) {
    ctx.fillStyle = DEFAULT_CREAM;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawWatermark(ctx, handle, domain, 'refined', false);
    const [l1, l2] = splitEditorialTitle(stripAccentMarkers(title));
    ctx.font = '22px NotoSansBold';
    ctx.fillStyle = '#aaaaaa';
    ctx.textBaseline = 'alphabetic';
    const eyebrow = (label || 'Карусель').toUpperCase();
    ctx.fillText(eyebrow, PADDING, WATERMARK_Y + 56);
    let y = WATERMARK_Y + 120;
    y = drawPlainParagraph(ctx, l1, PADDING, y, CANVAS_SIZE - PADDING * 2, 96, 102, '#1a1a1a', 'left', 'serif');
    if (l2) {
      const u = l2.toUpperCase();
      y = drawPlainParagraph(ctx, u, PADDING, y + 8, CANVAS_SIZE - PADDING * 2, 44, 52, '#1a1a1a', 'left', 'sansBold');
    }
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(CANVAS_SIZE - PADDING, y);
    ctx.stroke();
    y += 40;
    ctx.font = '22px NotoSans';
    ctx.fillStyle = '#bbbbbb';
    const meta = stripAccentMarkers(body).trim() ? stripAccentMarkers(body) : designNote || '';
    if (meta) drawPlainParagraph(ctx, meta, PADDING, y, CANVAS_SIZE - PADDING * 2, 22, 28, '#bbbbbb', 'left');
  } else {
    ctx.fillStyle = DEFAULT_DARK;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawWatermark(ctx, handle, domain, 'bold', true);
    const barW = 48;
    const barH = 6;
    const contentW = CANVAS_SIZE - PADDING * 2;
    let blockH = 0;
    ctx.font = '88px NotoSansBold';
    const titleSeg = parseAccentSpans(title);
    const words = segmentsToWords(titleSeg);
    const measure = (t: string) => {
      ctx.font = `88px NotoSans`;
      return ctx.measureText(t).width;
    };
    const lines = layoutWords(measure, words, contentW);
    blockH += barH + 20 + lines.length * 98 + 16;
    const sub = stripAccentMarkers(body).trim()
      ? stripAccentMarkers(body)
      : (label || designNote || '').trim();
    if (sub) blockH += 26 + 8;
    let y = CANVAS_SIZE - PADDING - blockH;
    const { r, g, b } = hexToRgb(accent);
    roundRectPath(ctx, PADDING, y, barW, barH, 3);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    y += barH + 20;
    let yy = y;
    for (let li = 0; li < lines.length; li++) {
      drawSegmentedLine(
        ctx,
        lines[li],
        PADDING,
        yy,
        88,
        '#ffffff',
        accent,
        brand.accentStyle,
        'left',
        contentW,
        false,
        900 + li,
      );
      yy += 98;
    }
    if (sub) {
      yy += 16;
      ctx.font = '26px NotoSans';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(sub, PADDING, yy);
    }
    drawProgressDots(ctx, input.slideIndex, input.totalSlides, accent, true);
  }
}

async function renderContent(
  ctx: SKRSContext2D,
  input: CarouselTemplateInput,
  refined: boolean,
): Promise<void> {
  const { brand, title, body, label, icon, items, handle, domain } = input;
  const accent = brand.accentColor || DEFAULT_ACCENT;
  const dark = DEFAULT_DARK;
  if (refined) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.strokeStyle = '#e8e3dc';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(0.25, 0.25, CANVAS_SIZE - 0.5, CANVAS_SIZE - 0.5);
    drawWatermark(ctx, handle, domain, 'refined', false);
    const [l1, l2] = splitEditorialTitle(stripAccentMarkers(title));
    let y = WATERMARK_Y + 48;
    ctx.font = '22px NotoSansBold';
    ctx.fillStyle = '#bbbbbb';
    const eyebrow = (label || '').trim().toUpperCase() || 'ФРАГМЕНТ';
    ctx.fillText(eyebrow, PADDING, y);
    y += 40;
    ctx.font = '72px NotoSerifItalic';
    y = drawPlainParagraph(ctx, l1, PADDING, y, CANVAS_SIZE - PADDING * 2, 72, 78, '#1a1a1a', 'left');
    y += 8;
    if (l2) {
      y = drawPlainParagraph(ctx, l2.toUpperCase(), PADDING, y, CANVAS_SIZE - PADDING * 2, 38, 44, '#1a1a1a', 'left');
      y += 8;
    }
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(PADDING + 44, y);
    ctx.stroke();
    y += 28;
    drawPlainParagraph(ctx, stripAccentMarkers(body), PADDING, y, CANVAS_SIZE - PADDING * 2, 32, 40, '#777777', 'left');
  } else {
    ctx.fillStyle = DEFAULT_BG;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawWatermark(ctx, handle, domain, 'bold', false);
    const contentW = CANVAS_SIZE - PADDING * 2;
    let y = PADDING + 40;
    const lab = (label || '').trim();
    let pillH = 0;
    if (lab) {
      pillH = 44;
      ctx.font = '22px NotoSansBold';
      const padX = 20;
      let inner = lab.toUpperCase();
      let iconW = 0;
      let iconImg: Image | null = null;
      if (icon) {
        iconImg = await rasterizePhosphorIcon(icon, 28, '#ffffff');
        iconW = iconImg ? 28 + 8 : 0;
      }
      const textW = ctx.measureText(inner).width;
      const pillW = padX * 2 + iconW + textW;
      const { r, g, b } = hexToRgb(accent);
      roundRectPath(ctx, PADDING, y, pillW, pillH, 8);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill();
      let tx = PADDING + padX;
      if (iconImg) {
        ctx.drawImage(iconImg, tx, y + 8, 28, 28);
        tx += 28 + 8;
      }
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(inner, tx, y + pillH / 2 + 2);
      y += pillH + 16;
    }
    y = drawParagraphSegmented(
      ctx,
      title,
      PADDING,
      y,
      contentW,
      76,
      84,
      dark,
      accent,
      brand.accentStyle,
      'left',
      false,
      120,
    );
    y += 20;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(PADDING + 32, y);
    ctx.stroke();
    y += 28;
    y = drawPlainParagraph(ctx, stripAccentMarkers(body), PADDING, y, contentW, 34, 54, '#666666', 'left');
    const chipItems = items && items.length > 0 && items.length <= 4 ? items : null;
    if (chipItems) {
      y += 24;
      let cx = PADDING;
      ctx.font = '22px NotoSans';
      const rowY = y;
      for (const ch of chipItems) {
        const t = ch.trim();
        if (!t) continue;
        const tw = ctx.measureText(t).width + 24;
        const chH = 36;
        ctx.fillStyle = '#f0ece6';
        roundRectPath(ctx, cx, rowY, tw, chH, 6);
        ctx.fill();
        ctx.fillStyle = '#555555';
        ctx.textBaseline = 'middle';
        ctx.fillText(t, cx + 12, rowY + chH / 2 + 1);
        cx += tw + 10;
        if (cx > CANVAS_SIZE - PADDING - 100) break;
      }
    }
    drawProgressDots(ctx, input.slideIndex, input.totalSlides, accent, false);
  }
}

async function renderStatement(
  ctx: SKRSContext2D,
  input: CarouselTemplateInput,
  refined: boolean,
): Promise<void> {
  const { brand, title, handle, domain, icon } = input;
  const accent = brand.accentColor || DEFAULT_ACCENT;
  if (refined) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawWatermark(ctx, handle, domain, 'refined', true);
    let y = CANVAS_SIZE / 2 - 80;
    ctx.font = '100px NotoSerifItalic';
    y = drawPlainParagraph(
      ctx,
      stripAccentMarkers(title),
      PADDING,
      y,
      CANVAS_SIZE - PADDING * 2,
      100,
      105,
      '#ffffff',
      'center',
      'serif',
    );
    y += 36;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((CANVAS_SIZE - 44) / 2, y);
    ctx.lineTo((CANVAS_SIZE + 44) / 2, y);
    ctx.stroke();
    y += 40;
    ctx.font = '22px NotoSansBold';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const sub = (input.label || '').trim().toUpperCase();
    if (sub) {
      const tw = ctx.measureText(sub).width;
      ctx.fillText(sub, (CANVAS_SIZE - tw) / 2, y);
    }
  } else {
    const { r, g, b } = hexToRgb(accent);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawWatermark(ctx, handle, domain, 'bold', true);
    const img = await rasterizePhosphorIcon(icon || 'sparkle', 120, '#ffffff');
    if (img) {
      ctx.drawImage(img, (CANVAS_SIZE - 120) / 2, CANVAS_SIZE * 0.2, 120, 120);
    }
    const y0 = CANVAS_SIZE * 0.2 + 140;
    const lines = layoutWords(
      (t) => {
        ctx.font = `88px NotoSans`;
        return ctx.measureText(t).width;
      },
      segmentsToWords(parseAccentSpans(title)),
      CANVAS_SIZE - PADDING * 2,
    );
    let yy = y0;
    for (let i = 0; i < lines.length; i++) {
      drawSegmentedLine(
        ctx,
        lines[i],
        PADDING,
        yy,
        88,
        '#ffffff',
        accent,
        brand.accentStyle,
        'center',
        CANVAS_SIZE - PADDING * 2,
        false,
        400 + i,
      );
      yy += 96;
    }
    drawProgressDots(ctx, input.slideIndex, input.totalSlides, '#ffffff', true);
  }
}

async function renderBullets(
  ctx: SKRSContext2D,
  input: CarouselTemplateInput,
  refined: boolean,
): Promise<void> {
  const { brand, title, body, items, handle, domain } = input;
  const accent = brand.accentColor || DEFAULT_ACCENT;
  const list = items?.length ? items : body.split('\n').map((s) => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  if (refined) {
    ctx.fillStyle = DEFAULT_CREAM;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawWatermark(ctx, handle, domain, 'refined', false);
    let y = PADDING + 40;
    y = drawPlainParagraph(
      ctx,
      stripAccentMarkers(title),
      PADDING,
      y,
      CANVAS_SIZE - PADDING * 2,
      72,
      78,
      '#1a1a1a',
      'left',
    );
    y += 28;
    let n = 1;
    for (const row of list.slice(0, 8)) {
      ctx.font = '52px NotoSerifItalic';
      ctx.fillStyle = '#c8c0b4';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(n), PADDING, y + 32);
      ctx.font = '32px NotoSans';
      ctx.fillStyle = '#555555';
      const colX = PADDING + 56;
      const yy = drawPlainParagraph(ctx, row, colX, y + 32, CANVAS_SIZE - colX - PADDING, 32, 38, '#555555', 'left');
      y = yy + 16;
      ctx.strokeStyle = '#ddd8d0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PADDING, y - 8);
      ctx.lineTo(CANVAS_SIZE - PADDING, y - 8);
      ctx.stroke();
      n++;
    }
  } else {
    ctx.fillStyle = DEFAULT_BG;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawWatermark(ctx, handle, domain, 'bold', false);
    let y = PADDING + 32;
    y = drawParagraphSegmented(
      ctx,
      title,
      PADDING,
      y,
      CANVAS_SIZE - PADDING * 2,
      66,
      72,
      DEFAULT_DARK,
      accent,
      brand.accentStyle,
      'left',
      false,
      500,
    );
    y += 32;
    const chk = await rasterizePhosphorIcon('check', 24, '#ffffff');
    for (const row of list.slice(0, 8)) {
      const { r, g, b } = hexToRgb(accent);
      roundRectPath(ctx, PADDING, y, 36, 36, 8);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill();
      if (chk) ctx.drawImage(chk, PADDING + 6, y + 6, 24, 24);
      drawPlainParagraph(ctx, row, PADDING + 36 + 16, y + 28, CANVAS_SIZE - PADDING * 2 - 52, 34, 40, '#555555', 'left');
      y += 36 + 20;
    }
    drawProgressDots(ctx, input.slideIndex, input.totalSlides, accent, false);
  }
}

async function renderCta(
  ctx: SKRSContext2D,
  input: CarouselTemplateInput,
  refined: boolean,
): Promise<void> {
  const { brand, title, body, label, handle, domain } = input;
  const accent = brand.accentColor || DEFAULT_ACCENT;
  if (refined) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.strokeStyle = '#e8e3dc';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(0.25, 0.25, CANVAS_SIZE - 0.5, CANVAS_SIZE - 0.5);
    drawWatermark(ctx, handle, domain, 'refined', false);
    let y = WATERMARK_Y + 56;
    ctx.font = '22px NotoSansBold';
    ctx.fillStyle = '#bbbbbb';
    ctx.fillText((label || 'ЗАКЛИК').toUpperCase(), PADDING, y);
    y += 48;
    const [l1, l2] = splitEditorialTitle(stripAccentMarkers(title));
    y = drawPlainParagraph(ctx, l1, PADDING, y, CANVAS_SIZE - PADDING * 2, 96, 102, '#1a1a1a', 'left', 'serif');
    y += 8;
    if (l2) {
      y = drawPlainParagraph(
        ctx,
        l2.toUpperCase(),
        PADDING,
        y,
        CANVAS_SIZE - PADDING * 2,
        44,
        52,
        '#1a1a1a',
        'left',
        'sansBold',
      );
    }
    y += 32;
    ctx.strokeStyle = '#e8e3dc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(CANVAS_SIZE - PADDING, y);
    ctx.stroke();
    y += 36;
    ctx.font = '28px NotoSans';
    ctx.fillStyle = '#888888';
    const action = stripAccentMarkers(body);
    const yAfterAction = drawPlainParagraph(
      ctx,
      action,
      PADDING,
      y,
      CANVAS_SIZE - PADDING * 2 - 60,
      28,
      34,
      '#888888',
      'left',
    );
    const circleY = yAfterAction - 20;
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE - PADDING - 24, circleY, 20, 0, Math.PI * 2);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '18px NotoSans';
    ctx.fillText('→', CANVAS_SIZE - PADDING - 30, circleY + 6);
  } else {
    ctx.fillStyle = DEFAULT_DARK;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawWatermark(ctx, handle, domain, 'bold', true);
    let y = PADDING + 60;
    const { r, g, b } = hexToRgb(accent);
    ctx.font = '24px NotoSansBold';
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.textBaseline = 'alphabetic';
    const eyebrow = (label || '').trim().toUpperCase();
    if (eyebrow) {
      const tw = ctx.measureText(eyebrow).width;
      ctx.fillText(eyebrow, (CANVAS_SIZE - tw) / 2, y);
    }
    y += 36;
    const lines = layoutWords(
      (t) => {
        ctx.font = `88px NotoSans`;
        return ctx.measureText(t).width;
      },
      segmentsToWords(parseAccentSpans(title)),
      CANVAS_SIZE - PADDING * 2,
    );
    let yy = y;
    for (let i = 0; i < lines.length; i++) {
      drawSegmentedLine(
        ctx,
        lines[i],
        PADDING,
        yy,
        88,
        '#ffffff',
        accent,
        brand.accentStyle,
        'center',
        CANVAS_SIZE - PADDING * 2,
        false,
        700 + i,
      );
      yy += 96;
    }
    y = yy + 24;
    const boxY = y;
    const innerPad = 32;
    const bodyText = stripAccentMarkers(body);
    const bodyLines = layoutWords(
      (t) => {
        ctx.font = '36px NotoSansBold';
        return ctx.measureText(t).width;
      },
      segmentsToWords(parseAccentSpans(bodyText)),
      CANVAS_SIZE - PADDING * 2 - innerPad * 2,
    );
    const bodyH = Math.max(1, bodyLines.length) * 42;
    const boxH = innerPad * 2 + bodyH;
    roundRectPath(ctx, PADDING, boxY, CANVAS_SIZE - PADDING * 2, boxH, 16);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    let iy = boxY + innerPad + 36;
    for (const bl of bodyLines) {
      const lineText = bl.map((w) => w.text).join('');
      ctx.font = '36px NotoSansBold';
      const tw = ctx.measureText(lineText).width;
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(lineText, (CANVAS_SIZE - tw) / 2, iy);
      iy += 42;
    }
    drawProgressDots(ctx, input.slideIndex, input.totalSlides, accent, true);
  }
}

export async function renderCarouselTemplatePng(input: CarouselTemplateInput): Promise<Buffer> {
  ensureCarouselFonts();
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');
  const refined = input.brand.vibe === 'refined';

  switch (input.slideKind) {
    case 'cover':
      await renderCover(ctx, input, refined);
      break;
    case 'content':
      await renderContent(ctx, input, refined);
      break;
    case 'statement':
      await renderStatement(ctx, input, refined);
      break;
    case 'bullets':
      await renderBullets(ctx, input, refined);
      break;
    case 'cta':
      await renderCta(ctx, input, refined);
      break;
    default:
      await renderContent(ctx, input, refined);
  }

  return canvas.toBuffer('image/png');
}
