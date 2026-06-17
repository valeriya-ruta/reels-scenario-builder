import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import {
  CANVAS_SIZE,
  CANVAS_HEIGHT,
  PADDING,
  WATERMARK_Y,
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
  type CarouselFonts,
} from '@/lib/carousel/canvasSegmentedText';
import { ensureCarouselFonts } from '@/lib/carousel/carouselFonts';
import type { BrandAccentStyle } from '@/lib/brand';
import { resolveTitleAndBodyColors, type CarouselBrandPalette } from '@/lib/carousel/colorSystem';

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

/** True when the given hex color is dark enough that light text reads best on it. */
function isDarkColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  // Perceived luminance (sRGB approximation).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.55;
}

/**
 * Alphabetic-baseline Y for the FIRST line of a CSS-style text block whose line
 * box top sits at `topY`, given a CSS `line-height` (in px). Mirrors how the
 * editor (DOM) positions glyphs: the baseline sits half the leading below the
 * line-box top, plus the font ascent. Keeps export glyph positions aligned with
 * the editor's flex/line-height layout instead of guessing 0.8·fontSize.
 */
function firstBaseline(
  ctx: SKRSContext2D,
  fontSize: number,
  lineHeight: number,
  topY: number,
  font: string,
): number {
  ctx.font = `${fontSize}px ${font}`;
  const m = ctx.measureText('Mg');
  const ascent =
    typeof m.actualBoundingBoxAscent === 'number' && m.actualBoundingBoxAscent > 0
      ? m.actualBoundingBoxAscent
      : fontSize * 0.8;
  const halfLeading = Math.max(0, (lineHeight - fontSize) / 2);
  return topY + halfLeading + ascent;
}

/** Top Y of a text block of height `blockH` for a given vertical placement,
 *  matching the editor's flex container (px padding `PADDING`, py padding 72). */
function placementTopY(placement: 'top' | 'center' | 'bottom', blockH: number): number {
  if (placement === 'top') return 72;
  if (placement === 'bottom') return CANVAS_HEIGHT - 72 - blockH;
  return Math.round((CANVAS_HEIGHT - blockH) / 2);
}

/** Wrap plain text to lines for a given font size (non-accent measurement). */
function wrapPlain(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  font: string,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  ctx.font = `${fontSize}px ${font}`;
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
  return lines;
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
  fonts: CarouselFonts,
  plainBaseIsBold = false,
): number {
  const segments = parseAccentSpans(text);
  const words = segmentsToWords(segments);
  const measurePlain = (t: string) => {
    ctx.font = `${fontSize}px ${plainBaseIsBold ? fonts.sansBold : fonts.sans}`;
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
      fonts,
      plainBaseIsBold,
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
  fonts: CarouselFonts,
  fontFamily: 'sans' | 'serif' | 'sansBold' = 'sans',
): number {
  const trimmed = text.trim();
  if (!trimmed) return yStart;
  const fontFace =
    fontFamily === 'serif'
      ? `italic ${fontSize}px ${fonts.serifItalic}`
      : fontFamily === 'sansBold'
        ? `bold ${fontSize}px ${fonts.sansBold}`
        : `${fontSize}px ${fonts.sans}`;
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

/** List marker for a given bullet style — mirrors CarouselSlidePreview.markerFor. */
function markerFor(
  style: CarouselTemplateInput['bulletStyle'],
  i: number,
): string {
  switch (style) {
    case 'numbered-simple':
      return `${i + 1} ·`;
    case 'dots':
      return '●';
    case 'dashes':
      return '—';
    case 'checks':
      return '✓';
    case 'cross-check':
      return i === 0 ? '✗' : '✓';
    case 'numbered-padded':
    default:
      return `${String(i + 1).padStart(2, '0')}.`;
  }
}

// Watermark removed entirely from exported slides (task 86d3btkv8). The
// drawWatermark helper and all its call sites were deleted so no "@handle" /
// "web.ruta.media" text can ever render on an exported slide again.

// Pagination intentionally removed from slide renders.

export type CarouselTemplateInput = {
  slideType: SlideTemplateKind;
  layoutPreset?: 'text' | 'quote' | 'testimonial' | 'list' | 'goal' | 'reaction' | null;
  title: string;
  body: string;
  /** Single shared alignment for title + body (defaults to left). */
  textAlign?: 'left' | 'center' | 'right';
  /** Vertical placement of the text block (mirrors the editor's flex justify). */
  placement?: 'top' | 'center' | 'bottom';
  label: string | null;
  items: string[] | null;
  icon: string | null;
  bulletStyle?: 'numbered-padded' | 'numbered-simple' | 'dots' | 'dashes' | 'checks' | 'cross-check' | null;
  testimonialAuthor?: { name: string; handle: string; avatar_url: string | null } | null;
  ctaAction?: 'follow' | 'save' | 'share' | 'comment' | 'link' | null;
  ctaTitle?: string | null;
  ctaKeyword?: string | null;
  titleSize?: 'L' | 'M';
  bodySize?: 'M' | 'S';
  backgroundType?: 'color' | 'gradient' | 'image';
  backgroundColor?: string;
  gradientMidColor?: string;
  gradientEndColor?: string;
  titleColor?: string;
  bodyColor?: string;
  designNote: string | null;
  slideIndex: number;
  totalSlides: number;
  /** Brand DNA palette, so renderers can resolve text contrast against a plate/box color. */
  palette: CarouselBrandPalette;
  brand: BrandDnaForRender;
  handle: string;
  domain: string;
};


function fillCoverBackground(
  ctx: SKRSContext2D,
  refined: boolean,
  brand: BrandDnaForRender,
  backgroundType?: 'color' | 'gradient' | 'image',
  backgroundColor?: string,
  gradientMidColor?: string,
  gradientEndColor?: string,
) {
  if (backgroundType === 'gradient') {
    const light = backgroundColor || brand.primaryColor || DEFAULT_CREAM;
    const mid = gradientMidColor || brand.accentColor || DEFAULT_ACCENT;
    const dark = gradientEndColor || DEFAULT_DARK;
    const g = refined
      ? ctx.createRadialGradient(CANVAS_SIZE * 0.4, CANVAS_HEIGHT * 0.3, 0, CANVAS_SIZE * 0.4, CANVAS_HEIGHT * 0.3, CANVAS_HEIGHT)
      : ctx.createRadialGradient(CANVAS_SIZE * 0.3, CANVAS_HEIGHT * 0.3, 0, CANVAS_SIZE * 0.3, CANVAS_HEIGHT * 0.3, CANVAS_HEIGHT);
    g.addColorStop(0, light);
    g.addColorStop(0.6, mid);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_HEIGHT);
    return;
  }
  ctx.fillStyle = backgroundType === 'color' ? (backgroundColor || (refined ? DEFAULT_CREAM : DEFAULT_DARK)) : refined ? DEFAULT_CREAM : DEFAULT_DARK;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_HEIGHT);
}

async function renderCover(
  ctx: SKRSContext2D,
  input: CarouselTemplateInput,
  refined: boolean,
  fonts: CarouselFonts,
): Promise<void> {
  const { brand, title, body, label, designNote } = input;
  const accent = brand.accentColor || DEFAULT_ACCENT;
  const titleColor = input.titleColor || '#000000';
  const bodyColor = input.bodyColor || '#000000';
  if (refined) {
    fillCoverBackground(
      ctx,
      true,
      brand,
      input.backgroundType,
      input.backgroundColor,
      input.gradientMidColor,
      input.gradientEndColor,
    );
    const [l1, l2] = splitEditorialTitle(stripAccentMarkers(title));
    ctx.font = `22px ${fonts.sansBold}`;
    ctx.fillStyle = '#aaaaaa';
    ctx.textBaseline = 'alphabetic';
    const eyebrow = (label || 'Карусель').toUpperCase();
    ctx.fillText(eyebrow, PADDING, WATERMARK_Y + 56);
    let y = WATERMARK_Y + 120;
    y = drawPlainParagraph(ctx, l1, PADDING, y, CANVAS_SIZE - PADDING * 2, 96, 102, '#1a1a1a', 'left', fonts, 'serif');
    if (l2) {
      const u = l2.toUpperCase();
      y = drawPlainParagraph(ctx, u, PADDING, y + 8, CANVAS_SIZE - PADDING * 2, 44, 52, '#1a1a1a', 'left', fonts, 'sansBold');
    }
    ctx.strokeStyle = '#c8c0b4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(CANVAS_SIZE - PADDING, y);
    ctx.stroke();
    y += 40;
    ctx.font = `22px ${fonts.sans}`;
    ctx.fillStyle = '#bbbbbb';
    const meta = stripAccentMarkers(body).trim() ? stripAccentMarkers(body) : designNote || '';
    if (meta) drawPlainParagraph(ctx, meta, PADDING, y, CANVAS_SIZE - PADDING * 2, 22, 28, '#bbbbbb', 'left', fonts);
  } else {
    // Bold cover — mirror CarouselSlidePreview's cover exactly: the text block is
    // vertically CENTERED, title is CENTER-aligned and BOLD at 88px (70px for M),
    // an accent bar sits above (left, like the editor's w-12 block), and an
    // optional subline (body, else label/design-note) shows below.
    fillCoverBackground(
      ctx,
      false,
      brand,
      input.backgroundType,
      input.backgroundColor,
      input.gradientMidColor,
      input.gradientEndColor,
    );
    const contentW = CANVAS_SIZE - PADDING * 2;
    const align: 'left' | 'center' | 'right' = 'center';
    const titleSizePx = (input.titleSize ?? 'L') === 'M' ? 78 : 96;
    const titleLineH = Math.round(titleSizePx * 0.98);
    const titleWords = segmentsToWords(parseAccentSpans(title));
    const titleLines = layoutWords(
      (t) => {
        ctx.font = `${titleSizePx}px ${fonts.sansBold}`;
        return ctx.measureText(t).width;
      },
      titleWords,
      contentW,
    );
    const titleBlockH = title.trim() ? Math.max(1, titleLines.length) * titleLineH : 0;

    const bodyLine = stripAccentMarkers(body).trim();
    const fallbackSub = (label || designNote || '').trim();
    const hasSub = Boolean(bodyLine || fallbackSub);
    const subSizePx = 30;
    const subLineH = Math.round(subSizePx * 1.3);
    const subLines = hasSub
      ? Math.max(1, wrapPlain(ctx, bodyLine || fallbackSub, contentW, subSizePx, fonts.sans).length)
      : 0;

    const barW = 48;
    const barH = 6;
    const barMb = 20; // mb-5
    const subMt = 12; // mt-3
    const blockH =
      barH + barMb + titleBlockH + (hasSub ? subMt + subLines * subLineH : 0);

    let y = placementTopY('center', blockH);
    const { r, g, b } = hexToRgb(accent);
    roundRectPath(ctx, PADDING, y, barW, barH, 3);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    y += barH + barMb;

    let baseline = firstBaseline(ctx, titleSizePx, titleLineH, y, fonts.sansBold);
    for (let li = 0; li < titleLines.length; li++) {
      drawSegmentedLine(
        ctx,
        titleLines[li],
        PADDING,
        baseline,
        titleSizePx,
        titleColor,
        accent,
        brand.accentStyle,
        align,
        contentW,
        false,
        900 + li,
        fonts,
        true,
      );
      baseline += titleLineH;
    }
    y += titleBlockH;

    if (hasSub) {
      y += subMt;
      const subBaseline = firstBaseline(ctx, subSizePx, subLineH, y, fonts.sans);
      if (bodyLine) {
        drawParagraphSegmented(
          ctx,
          body,
          PADDING,
          subBaseline,
          contentW,
          subSizePx,
          subLineH,
          bodyColor,
          accent,
          brand.accentStyle,
          align,
          false,
          950,
          fonts,
        );
      } else {
        drawPlainParagraph(
          ctx,
          fallbackSub,
          PADDING,
          subBaseline,
          contentW,
          subSizePx,
          subLineH,
          bodyColor,
          align,
          fonts,
        );
      }
    }
  }
}

async function renderContent(
  ctx: SKRSContext2D,
  input: CarouselTemplateInput,
  refined: boolean,
  fonts: CarouselFonts,
): Promise<void> {
  const { brand, title, body, label } = input;
  const accent = brand.accentColor || DEFAULT_ACCENT;
  const titleColor = input.titleColor || '#000000';
  const bodyColor = input.bodyColor || '#000000';
  if (refined) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_HEIGHT);
    ctx.strokeStyle = '#e8e3dc';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(0.25, 0.25, CANVAS_SIZE - 0.5, CANVAS_HEIGHT - 0.5);
    const [l1, l2] = splitEditorialTitle(stripAccentMarkers(title));
    let y = WATERMARK_Y + 48;
    ctx.font = `22px ${fonts.sansBold}`;
    ctx.fillStyle = '#bbbbbb';
    const eyebrow = (label || '').trim().toUpperCase() || 'ФРАГМЕНТ';
    ctx.fillText(eyebrow, PADDING, y);
    y += 40;
    ctx.font = `72px ${fonts.serifItalic}`;
    y = drawPlainParagraph(ctx, l1, PADDING, y, CANVAS_SIZE - PADDING * 2, 72, 78, '#1a1a1a', 'left', fonts);
    y += 8;
    if (l2) {
      y = drawPlainParagraph(ctx, l2.toUpperCase(), PADDING, y, CANVAS_SIZE - PADDING * 2, 38, 44, '#1a1a1a', 'left', fonts);
      y += 8;
    }
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(PADDING + 44, y);
    ctx.stroke();
    y += 28;
    drawPlainParagraph(ctx, stripAccentMarkers(body), PADDING, y, CANVAS_SIZE - PADDING * 2, 32, 40, '#777777', 'left', fonts);
  } else {
    // Bold content slide — mirror CarouselSlidePreview's default slide: the block
    // is vertically placed (placement), the label pill is a rounded-full chip with
    // WHITE text and NO icon, the title is BOLD at 64px (52px for M), and the body
    // is plain at 34px (27px for S). No divider, no chips (the editor draws none).
    const align = input.textAlign ?? 'left';
    const placement = input.placement ?? 'center';
    ctx.fillStyle = input.backgroundColor || DEFAULT_BG;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_HEIGHT);
    const contentW = CANVAS_SIZE - PADDING * 2;
    const lab = (label || '').trim();

    const titleSizePx = (input.titleSize ?? 'L') === 'M' ? 58 : 72;
    const titleLineH = Math.round(titleSizePx * 1.05);
    const titleLines = layoutWords(
      (t) => {
        ctx.font = `${titleSizePx}px ${fonts.sansBold}`;
        return ctx.measureText(t).width;
      },
      segmentsToWords(parseAccentSpans(title)),
      contentW,
    );
    const titleBlockH = title.trim() ? Math.max(1, titleLines.length) * titleLineH : 0;

    const bodyText = stripAccentMarkers(body);
    const bodySizePx = (input.bodySize ?? 'M') === 'S' ? 30 : 38;
    const bodyLineH = Math.round(bodySizePx * 1.625); // leading-relaxed
    const bodyLines = wrapPlain(ctx, bodyText, contentW, bodySizePx, fonts.sans);
    const bodyBlockH = bodyLines.length * bodyLineH;

    // Pill geometry (rounded-full, white text). px-5 / py-2 / text-22.
    const pillTextSize = 22;
    const pillPadX = 20;
    const pillH = lab ? 40 : 0;
    const pillToTitle = lab ? 32 : 0; // mt-8
    const titleToBody = bodyBlockH ? 24 : 0; // mt-6

    const blockH = pillH + pillToTitle + titleBlockH + titleToBody + bodyBlockH;
    let y = placementTopY(placement, blockH);

    if (lab) {
      ctx.font = `${pillTextSize}px ${fonts.sansBold}`;
      const textW = ctx.measureText(lab).width;
      const pillW = pillPadX * 2 + textW;
      const pillX =
        align === 'right'
          ? PADDING + contentW - pillW
          : align === 'center'
            ? PADDING + (contentW - pillW) / 2
            : PADDING;
      const { r, g, b } = hexToRgb(accent);
      roundRectPath(ctx, pillX, y, pillW, pillH, pillH / 2);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(lab, pillX + pillPadX, y + pillH / 2 + 1);
      y += pillH;
    }
    y += pillToTitle;

    let baseline = firstBaseline(ctx, titleSizePx, titleLineH, y, fonts.sansBold);
    for (let i = 0; i < titleLines.length; i++) {
      drawSegmentedLine(
        ctx,
        titleLines[i],
        PADDING,
        baseline,
        titleSizePx,
        titleColor,
        accent,
        brand.accentStyle,
        align,
        contentW,
        false,
        120 + i,
        fonts,
        true,
      );
      baseline += titleLineH;
    }
    y += titleBlockH + titleToBody;

    if (bodyLines.length) {
      let bBaseline = firstBaseline(ctx, bodySizePx, bodyLineH, y, fonts.sans);
      ctx.font = `${bodySizePx}px ${fonts.sans}`;
      for (const ln of bodyLines) {
        const w = ctx.measureText(ln).width;
        const lx =
          align === 'right'
            ? PADDING + contentW - w
            : align === 'center'
              ? PADDING + (contentW - w) / 2
              : PADDING;
        const { r, g, b } = hexToRgb(bodyColor);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(ln, lx, bBaseline);
        bBaseline += bodyLineH;
      }
    }
  }
}

async function renderStatement(
  ctx: SKRSContext2D,
  input: CarouselTemplateInput,
  refined: boolean,
  fonts: CarouselFonts,
): Promise<void> {
  const { brand, title } = input;
  const accent = brand.accentColor || DEFAULT_ACCENT;
  const titleColor = input.titleColor || '#000000';
  if (refined) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_HEIGHT);
    let y = CANVAS_HEIGHT / 2 - 80;
    ctx.font = `100px ${fonts.serifItalic}`;
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
      fonts,
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
    ctx.font = `22px ${fonts.sansBold}`;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const sub = (input.label || '').trim().toUpperCase();
    if (sub) {
      const tw = ctx.measureText(sub).width;
      ctx.fillText(sub, (CANVAS_SIZE - tw) / 2, y);
    }
  } else {
    // Bold quote/testimonial — mirror CarouselSlidePreview: real background color
    // (chosen color for `color` backgrounds, else brand accent), BOLD text sized
    // 82px quote / 52px testimonial (70/46 for M), vertically CENTERED. The editor
    // draws NO icon on a statement, so the export must not either.
    const quoteBg =
      input.backgroundType === 'color' && input.backgroundColor ? input.backgroundColor : accent;
    const { r, g, b } = hexToRgb(quoteBg);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_HEIGHT);
    const statementTextColor = titleColor;
    const align = input.textAlign ?? 'left';
    const isTestimonial = input.layoutPreset === 'testimonial';
    const sizePx = isTestimonial
      ? (input.titleSize ?? 'L') === 'M'
        ? 46
        : 52
      : (input.titleSize ?? 'L') === 'M'
        ? 70
        : 82;
    const lineH = Math.round(sizePx * 1.25); // leading-tight
    const contentW = CANVAS_SIZE - PADDING * 2;
    const lines = layoutWords(
      (t) => {
        ctx.font = `${sizePx}px ${fonts.sansBold}`;
        return ctx.measureText(t).width;
      },
      segmentsToWords(parseAccentSpans(title)),
      contentW,
    );
    const blockH = Math.max(1, lines.length) * lineH;
    // Testimonials reserve room for the author row the caller draws below center.
    const topY = isTestimonial
      ? Math.round(CANVAS_HEIGHT * 0.5 - blockH - 20)
      : placementTopY('center', blockH);
    let yy = firstBaseline(ctx, sizePx, lineH, topY, fonts.sansBold);
    for (let i = 0; i < lines.length; i++) {
      drawSegmentedLine(
        ctx,
        lines[i],
        PADDING,
        yy,
        sizePx,
        statementTextColor,
        accent,
        brand.accentStyle,
        align,
        contentW,
        false,
        400 + i,
        fonts,
        true,
      );
      yy += lineH;
    }
  }
}

async function renderBullets(
  ctx: SKRSContext2D,
  input: CarouselTemplateInput,
  refined: boolean,
  fonts: CarouselFonts,
): Promise<void> {
  const { brand, title, body, items } = input;
  const accent = brand.accentColor || DEFAULT_ACCENT;
  const titleColor = input.titleColor || '#000000';
  const bodyColor = input.bodyColor || '#000000';
  const list = items?.length ? items : body.split('\n').map((s) => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  if (refined) {
    ctx.fillStyle = DEFAULT_CREAM;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_HEIGHT);
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
      fonts,
    );
    y += 28;
    let n = 1;
    for (const row of list.slice(0, 8)) {
      ctx.font = `52px ${fonts.serifItalic}`;
      ctx.fillStyle = '#c8c0b4';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(n), PADDING, y + 32);
      ctx.font = `32px ${fonts.sans}`;
      ctx.fillStyle = '#555555';
      const colX = PADDING + 56;
      const yy = drawPlainParagraph(ctx, row, colX, y + 32, CANVAS_SIZE - colX - PADDING, 32, 38, '#555555', 'left', fonts);
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
    // Bold list — mirror CarouselSlidePreview's `list` layout EXACTLY:
    //   • title (bold, sized 56px / 45px M), then a `mt-10` (40px) gap;
    //   • numbered/marker rows with a 48px marker COLUMN (min-w-[48px]) in the
    //     accent colour, a 16px gap (gap-4), then hanging-indented wrapped text;
    //   • markers follow `bulletStyle` (01./02. by default — NOT checkboxes);
    //   • the WHOLE block is vertically placed (placement) like the editor's flex
    //     justify, instead of being top-aligned.
    const align = input.textAlign ?? 'left';
    const placement = input.placement ?? 'center';
    ctx.fillStyle = input.backgroundColor || DEFAULT_BG;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_HEIGHT);
    const contentW = CANVAS_SIZE - PADDING * 2;

    // Editor shows 3 placeholder items when the list is empty.
    const rows = (list.length ? list : ['Пункт 1', 'Пункт 2', 'Пункт 3']).slice(0, 8);
    const bulletStyle = input.bulletStyle ?? 'numbered-padded';

    const titleSizePx = (input.titleSize ?? 'L') === 'M' ? 45 : 56;
    const titleLineH = Math.round(titleSizePx * 1.25); // leading-tight
    const titleLines = layoutWords(
      (t) => {
        ctx.font = `${titleSizePx}px ${fonts.sansBold}`;
        return ctx.measureText(t).width;
      },
      segmentsToWords(parseAccentSpans(title)),
      contentW,
    );
    const titleBlockH = title.trim() ? Math.max(1, titleLines.length) * titleLineH : 0;

    // List geometry. Marker column min-w-[48px], gap-4 (16px); items always
    // left-aligned (the editor's <ul> forces text-left). Hanging indent = wrapped
    // lines start under the text column, not the marker.
    const markerColW = 48;
    const markerGap = 16;
    const textX = PADDING + markerColW + markerGap;
    const textW = contentW - markerColW - markerGap;
    const markerSizePx = 28; // text-[28px]
    const bodySizePx = (input.bodySize ?? 'M') === 'S' ? 29 : 36;
    const bodyLineH = Math.round(bodySizePx * 1.375); // leading-snug
    const itemGap = 12; // space-y-3 (bold)

    const itemLines = rows.map((row) => {
      const lines = wrapPlain(ctx, row, textW, bodySizePx, fonts.sans);
      return lines.length ? lines : [''];
    });
    const itemHeights = itemLines.map((lines) => lines.length * bodyLineH);
    const listH =
      itemHeights.reduce((a, b) => a + b, 0) + itemGap * Math.max(0, rows.length - 1);

    const gapTitleList = titleBlockH ? 40 : 0; // mt-10
    const blockH = titleBlockH + gapTitleList + listH;
    let y = placementTopY(placement, blockH);

    // Title (respects textAlign; bold).
    let tb = firstBaseline(ctx, titleSizePx, titleLineH, y, fonts.sansBold);
    for (let i = 0; i < titleLines.length; i++) {
      drawSegmentedLine(
        ctx,
        titleLines[i],
        PADDING,
        tb,
        titleSizePx,
        titleColor,
        accent,
        brand.accentStyle,
        align,
        contentW,
        false,
        500 + i,
        fonts,
        true,
      );
      tb += titleLineH;
    }
    y += titleBlockH + gapTitleList;

    // Rows: marker in its column + hanging-indented text.
    for (let idx = 0; idx < itemLines.length; idx++) {
      const lines = itemLines[idx];
      const baseFirst = firstBaseline(ctx, bodySizePx, bodyLineH, y, fonts.sans);

      const markerHex =
        bulletStyle === 'cross-check' && idx === 0 ? '#DC2626' : accent;
      const { r: mr, g: mg, b: mb } = hexToRgb(markerHex);
      ctx.font = `${markerSizePx}px ${fonts.sansBold}`; // font-semibold
      ctx.fillStyle = `rgb(${mr},${mg},${mb})`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(markerFor(bulletStyle, idx), PADDING, baseFirst);

      ctx.font = `${bodySizePx}px ${fonts.sans}`;
      const { r: br, g: bg, b: bb } = hexToRgb(bodyColor);
      ctx.fillStyle = `rgb(${br},${bg},${bb})`;
      let by = baseFirst;
      for (const ln of lines) {
        ctx.fillText(ln, textX, by);
        by += bodyLineH;
      }
      y += itemHeights[idx] + (idx < itemLines.length - 1 ? itemGap : 0);
    }
  }
}

async function renderCta(
  ctx: SKRSContext2D,
  input: CarouselTemplateInput,
  refined: boolean,
  fonts: CarouselFonts,
): Promise<void> {
  const { brand, title, body, label } = input;
  const accent = brand.accentColor || DEFAULT_ACCENT;
  const titleColor = input.titleColor || '#000000';
  if (refined) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_HEIGHT);
    ctx.strokeStyle = '#e8e3dc';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(0.25, 0.25, CANVAS_SIZE - 0.5, CANVAS_HEIGHT - 0.5);
    let y = WATERMARK_Y + 56;
    ctx.font = `22px ${fonts.sansBold}`;
    ctx.fillStyle = '#bbbbbb';
    ctx.fillText((label || 'ЗАКЛИК').toUpperCase(), PADDING, y);
    y += 48;
    const [l1, l2] = splitEditorialTitle(stripAccentMarkers(title));
    y = drawPlainParagraph(ctx, l1, PADDING, y, CANVAS_SIZE - PADDING * 2, 96, 102, '#1a1a1a', 'left', fonts, 'serif');
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
        fonts,
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
    ctx.font = `28px ${fonts.sans}`;
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
      fonts,
    );
    const circleY = yAfterAction - 20;
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE - PADDING - 24, circleY, 20, 0, Math.PI * 2);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `18px ${fonts.sans}`;
    ctx.fillText('→', CANVAS_SIZE - PADDING - 30, circleY + 6);
  } else {
    // Bold CTA/final (goal) — mirror CarouselSlidePreview's final slide: NO
    // eyebrow, BOLD title at 72px (58 for M), then a full-width accent box with
    // the CTA word. The whole block is vertically CENTERED.
    const align = input.textAlign ?? 'left';
    ctx.fillStyle = input.backgroundColor || DEFAULT_DARK;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_HEIGHT);
    const { r, g, b } = hexToRgb(accent);
    const contentW = CANVAS_SIZE - PADDING * 2;

    const titleSizePx = (input.titleSize ?? 'L') === 'M' ? 58 : 72;
    const titleLineH = Math.round(titleSizePx * 1.05);
    const titleLines = layoutWords(
      (t) => {
        ctx.font = `${titleSizePx}px ${fonts.sansBold}`;
        return ctx.measureText(t).width;
      },
      segmentsToWords(parseAccentSpans(title)),
      contentW,
    );
    const titleBlockH = title.trim() ? Math.max(1, titleLines.length) * titleLineH : 0;

    // Accent box (rounded-2xl, py-6) with bold 36px body. The CTA body shares the
    // title's left edge — no extra horizontal indent inside the box (task
    // 86d36ejc6): the body uses the SAME content margins (PADDING..CANVAS-PADDING)
    // as the title, so both start at the same x for whatever alignment is set.
    const boxBodyText = stripAccentMarkers(body).trim() || 'Підпишись';
    const boxBodySize = 36;
    const boxPadY = 24; // py-6
    const boxBodyLineH = Math.round(boxBodySize * 1.2);
    const boxBodyLines = wrapPlain(ctx, boxBodyText, contentW, boxBodySize, fonts.sansBold);
    const boxBodyH = Math.max(1, boxBodyLines.length) * boxBodyLineH;
    const boxH = boxPadY * 2 + boxBodyH;

    const gap = titleBlockH ? 40 : 0; // mt-10
    const blockH = titleBlockH + gap + boxH;
    let y = placementTopY('center', blockH);

    let baseline = firstBaseline(ctx, titleSizePx, titleLineH, y, fonts.sansBold);
    for (let i = 0; i < titleLines.length; i++) {
      drawSegmentedLine(
        ctx,
        titleLines[i],
        PADDING,
        baseline,
        titleSizePx,
        titleColor,
        accent,
        brand.accentStyle,
        align,
        contentW,
        false,
        700 + i,
        fonts,
        true,
      );
      baseline += titleLineH;
    }
    y += titleBlockH + gap;

    const boxY = y;
    roundRectPath(ctx, PADDING, boxY, contentW, boxH, 16);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    // The body sits on the ACCENT box, so its text must contrast with the box
    // color (not the slide background) — prevents black-on-red.
    const ctaBoxTextColor = resolveTitleAndBodyColors('color', accent, input.palette).bodyColor;
    const boxLeft = PADDING; // share the title's left edge — no extra indent
    const boxRight = CANVAS_SIZE - PADDING;
    let by = firstBaseline(ctx, boxBodySize, boxBodyLineH, boxY + boxPadY, fonts.sansBold);
    ctx.font = `${boxBodySize}px ${fonts.sansBold}`;
    for (const ln of boxBodyLines) {
      const tw = ctx.measureText(ln).width;
      const lx = align === 'right' ? boxRight - tw : align === 'center' ? (CANVAS_SIZE - tw) / 2 : boxLeft;
      ctx.fillStyle = ctaBoxTextColor;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(ln, lx, by);
      by += boxBodyLineH;
    }
  }
}

export async function renderCarouselTemplatePng(input: CarouselTemplateInput): Promise<Buffer> {
  const fonts = ensureCarouselFonts(input.brand.fontPairing);
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');
  const refined = input.brand.vibe === 'refined';
  const preset = input.layoutPreset ?? (input.slideType === 'final' ? 'goal' : 'text');
  if (input.slideType === 'cover') {
    // Keep body + label: the editor's cover shows a subline (body, else
    // label/design-note), so the export must too.
    await renderCover(ctx, input, refined, fonts);
  } else if (input.slideType === 'slide') {
    if (preset === 'quote') {
      await renderStatement(
        ctx,
        { ...input, title: input.title.trim() || input.body.trim(), body: '', label: null },
        refined,
        fonts,
      );
    }
    else if (preset === 'testimonial') {
      await renderStatement(
        ctx,
        { ...input, title: input.title.trim() || input.body.trim(), body: '', label: null },
        refined,
        fonts,
      );
      const y = refined ? CANVAS_HEIGHT * 0.73 : CANVAS_HEIGHT * 0.66;
      if (refined) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PADDING, y - 20);
        ctx.lineTo(CANVAS_SIZE - PADDING, y - 20);
        ctx.stroke();
      }
      const author = input.testimonialAuthor;
      const name = author?.name?.trim() || 'Автор';
      const handle = author?.handle?.trim() || '@handle';
      ctx.fillStyle = refined ? '#ffffff' : '#ffffff';
      ctx.font = `bold 28px ${fonts.sansBold}`;
      ctx.fillText(name, PADDING + 66, y);
      ctx.font = `24px ${fonts.sans}`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(handle, PADDING + 66, y + 30);
      ctx.beginPath();
      ctx.arc(PADDING + 24, y - 8, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fill();
    } else if (preset === 'list') {
      await renderBullets(ctx, { ...input, body: '', items: input.items }, refined, fonts);
    } else {
      // Pill = the editor's optionalLabel only (input.label); never design_note.
      await renderContent(ctx, input, refined, fonts);
    }
  } else {
    if (preset === 'reaction') {
      await renderCta(ctx, { ...input, title: input.ctaTitle || input.title, body: '' }, refined, fonts);
      const kw = (input.ctaKeyword || '').trim() || 'РУТА';
      ctx.textBaseline = 'alphabetic';
      ctx.font = refined ? `italic 128px ${fonts.serifItalic}` : `900 128px ${fonts.sansBold}`;
      ctx.fillStyle = refined ? '#1a1a1a' : '#ffffff';
      const tw = ctx.measureText(kw).width;
      ctx.fillText(kw, (CANVAS_SIZE - tw) / 2, CANVAS_HEIGHT * 0.62);
    } else {
      // Match the editor's goal slide: the accent box shows the slide's body
      // (else the «Підпишись» default), NOT a CTA-action word. renderCta falls
      // back to «Підпишись» when body is empty.
      await renderCta(ctx, input, refined, fonts);
    }
  }

  return canvas.toBuffer('image/png');
}
