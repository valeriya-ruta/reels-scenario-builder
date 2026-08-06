// ─────────────────────────────────────────────────────────────────────────────
// buildSlideSvg — the SINGLE SOURCE OF TRUTH for a Modern Elegant slide.
// The editor renders this SVG inline (scaled); export rasterizes the SAME string.
// All wrap/justify geometry is baked in via the injected browser measurer, so the
// two are pixel-identical by construction.
// ─────────────────────────────────────────────────────────────────────────────

import {
  LAB_CANVAS_W as W,
  LAB_CANVAS_H as H,
  type LabImage,
  type LabSlide,
} from './types';
import {
  COLORS,
  FONT_FAMILY,
  WEIGHT,
  LINE_HEIGHT,
  SIZE,
  GAP,
  CHIP,
  LAYOUT,
  SLOTS,
  CTA_ICONS,
  POINT_AB_TEXT,
  IMAGE_HALF_PAD,
  PARAGRAPH_GAP,
  type Slot,
} from './tokens';
import { layoutParagraphs, type Measure, type TextBlock } from './textLayout';

export type Measurer = (text: string, fontPx: number, weight: number) => number;

export type BuildOpts = {
  measure: Measurer;
  /** Resolve an image slot to an <image href> value (data-uri or url), or null. */
  imageSrc?: (img: LabImage | undefined) => string | null;
  /** Self-contained @font-face block for export rasterization. */
  embedFontCss?: string | null;
};

// ── small utils ─────────────────────────────────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100;
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function up(s: string): string {
  return (s ?? '').toLocaleUpperCase('uk');
}
function bind(m: Measurer, fontPx: number, weight: number): Measure {
  return (t: string) => m(t, fontPx, weight);
}

const CAP = 0.72; // all-caps glyph height as a fraction of font size

type El = { h: number; gapAfter: number; draw: (y: number) => string };

function stack(els: El[], startY: number): string {
  let y = startY;
  const out: string[] = [];
  els.forEach((el, i) => {
    out.push(el.draw(y));
    y += el.h;
    if (i < els.length - 1) y += el.gapAfter;
  });
  return out.join('');
}

function stackHeight(els: El[]): number {
  return els.reduce((a, e, i) => a + e.h + (i < els.length - 1 ? e.gapAfter : 0), 0);
}

// ── text emitters ────────────────────────────────────────────────────────────
function emitBlock(block: TextBlock, topY: number, size: number, weight: number, color: string): string {
  return block.lines
    .map((line) => {
      const by = r2(topY + line.baseline);
      const tspans = line.words.map((w) => `<tspan x="${r2(w.x)}">${esc(w.text)}</tspan>`).join('');
      return `<text y="${by}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="${weight}" fill="${color}">${tspans}</text>`;
    })
    .join('');
}

function headingBlock(text: string, m: Measurer, size: number, weight: number, marginX: number, maxW: number): TextBlock {
  return layoutParagraphs(up(text), {
    measure: bind(m, size, weight),
    fontPx: size,
    lineHeight: Math.round(size * LINE_HEIGHT.title),
    maxWidth: maxW,
    marginX,
    align: 'left',
  }, 0);
}

function bodyBlock(text: string, m: Measurer, size: number, marginX: number, maxW: number, align: 'left' | 'center' | 'justify' = 'justify'): TextBlock {
  const lh = Math.round(size * LINE_HEIGHT.body);
  return layoutParagraphs(up(text), {
    measure: bind(m, size, WEIGHT.body),
    fontPx: size,
    lineHeight: lh,
    maxWidth: maxW,
    marginX,
    align,
  }, Math.round(lh * PARAGRAPH_GAP));
}

// ── image emitters ────────────────────────────────────────────────────────────
function placeholder(slot: Slot): string {
  return `<rect x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" fill="${COLORS.imagePlaceholder}"/>`;
}
function imageEl(slot: Slot, href: string, fit: 'cover' | 'contain'): string {
  const par = fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
  return `<image x="${slot.x}" y="${slot.y}" width="${slot.w}" height="${slot.h}" href="${esc(href)}" preserveAspectRatio="${par}"/>`;
}
function slotImage(slot: Slot, img: LabImage | undefined, fit: 'cover' | 'contain', opts: BuildOpts): string {
  const src = opts.imageSrc?.(img) ?? null;
  if (!src) return placeholder(slot);
  // contain-fit letterboxes onto the slide background (never cropped).
  return imageEl(slot, src, fit);
}

// ── chip (white box + knockout background-colored text) ────────────────────────
function chipLine(text: string, x: number, topY: number, size: number, weight: number): { svg: string; h: number } {
  const cap = size * CAP;
  const h = Math.round(cap + 2 * CHIP.padY);
  return {
    h,
    svg:
      `<rect x="${r2(x - CHIP.padX)}" y="${r2(topY)}" width="__W__" height="${h}" rx="${CHIP.radius}" fill="${COLORS.chipFill}"/>` +
      `<text x="${r2(x)}" y="${r2(topY + CHIP.padY + cap)}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="${weight}" fill="${COLORS.chipText}">${esc(text)}</text>`,
  };
}

// ── vertical placement ─────────────────────────────────────────────────────────
function placeStart(els: El[], strategy: 'center' | 'top', topAnchor: number, region: [number, number] = [0, H]): number {
  const total = stackHeight(els);
  const [top, bottom] = region;
  const avail = bottom - top;
  if (strategy === 'top') return top + topAnchor;
  const start = top + Math.round((avail - total) / 2);
  return Math.max(top + 24, start); // clamp so overflow leans down, never off-top
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-type composition
// ─────────────────────────────────────────────────────────────────────────────
function renderCover(slide: LabSlide, o: BuildOpts): string {
  const L = LAYOUT.cover;
  const m = o.measure;
  const els: El[] = [];
  const titleB = headingBlock(slide.title, m, SIZE.coverTitle, WEIGHT.title, L.marginX, L.maxTextW);
  els.push({ h: titleB.height, gapAfter: GAP.coverTitleToBody, draw: (y) => emitBlock(titleB, y, SIZE.coverTitle, WEIGHT.title, COLORS.title) });
  if (slide.subtype === 'title_subtext' && slide.body.trim()) {
    const b = bodyBlock(slide.body, m, SIZE.coverBody, L.marginX, L.maxTextW);
    els.push({ h: b.height, gapAfter: 0, draw: (y) => emitBlock(b, y, SIZE.coverBody, WEIGHT.body, COLORS.body) });
  }
  const start = placeStart(els, 'center', 0);
  return stack(els, start);
}

function renderTextParagraph(slide: LabSlide, o: BuildOpts, region: [number, number], strategy: 'center' | 'top', topAnchor: number): string {
  const L = LAYOUT.text;
  const m = o.measure;
  const els: El[] = [];
  const titleB = headingBlock(slide.title, m, SIZE.slideTitle, WEIGHT.title, L.marginX, L.maxTextW);
  els.push({ h: titleB.height, gapAfter: GAP.slideTitleToBody, draw: (y) => emitBlock(titleB, y, SIZE.slideTitle, WEIGHT.title, COLORS.title) });
  if (slide.body.trim()) {
    const b = bodyBlock(slide.body, m, SIZE.slideBody, L.marginX, L.maxTextW);
    els.push({ h: b.height, gapAfter: 0, draw: (y) => emitBlock(b, y, SIZE.slideBody, WEIGHT.body, COLORS.body) });
  }
  const start = placeStart(els, strategy, topAnchor, region);
  return stack(els, start);
}

function wrapBullet(item: string, prefix: string, m: Measurer, size: number, weight: number, marginX: number, maxW: number): { text: string; x: number }[] {
  const mm = bind(m, size, weight);
  const markerW = mm(prefix);
  const words = up(item).split(/\s+/).filter(Boolean);
  const lines: { text: string; x: number }[] = [];
  let cur = prefix;
  let curX = marginX;
  let first = true;
  const flush = () => lines.push({ text: cur.replace(/\s+$/, ''), x: curX });
  for (const w of words) {
    const trial = cur + (cur.endsWith(' ') || cur === prefix ? '' : ' ') + w;
    const maxForLine = first ? maxW : maxW - markerW;
    if (mm(trial) - (first ? 0 : 0) > maxForLine && cur !== prefix && cur.trim() !== '') {
      flush();
      first = false;
      cur = w;
      curX = marginX + markerW;
    } else {
      cur = cur === prefix ? prefix + w : trial;
    }
  }
  flush();
  return lines.length ? lines : [{ text: prefix.trim(), x: marginX }];
}

function renderTextList(slide: LabSlide, o: BuildOpts, numbered: boolean): string {
  const L = LAYOUT.bullets;
  const m = o.measure;
  const els: El[] = [];

  const titleB = headingBlock(slide.title, m, SIZE.slideTitle, WEIGHT.title, L.marginX, L.maxTextW);
  els.push({ h: titleB.height, gapAfter: GAP.slideTitleToBody, draw: (y) => emitBlock(titleB, y, SIZE.slideTitle, WEIGHT.title, COLORS.title) });

  if (slide.body.trim()) {
    const intro = bodyBlock(slide.body, m, SIZE.slideBody, L.marginX, L.maxTextW);
    els.push({ h: intro.height, gapAfter: GAP.titleToBullets, draw: (y) => emitBlock(intro, y, SIZE.slideBody, WEIGHT.body, COLORS.body) });
  }

  // bullets
  const size = SIZE.bullet;
  const cap = size * CAP;
  const lineH = Math.round(cap + 2 * CHIP.padY);
  const advance = lineH + CHIP.gap;
  const bullets = slide.bullets.filter((b) => b.trim());
  const bulletLines: { text: string; x: number }[] = [];
  bullets.forEach((item, i) => {
    const prefix = numbered ? `${i + 1}. ` : '• ';
    wrapBullet(item, prefix, m, size, WEIGHT.chip, L.marginX + CHIP.padX, L.maxTextW - CHIP.padX).forEach((ln) => bulletLines.push(ln));
  });
  if (bulletLines.length) {
    const h = bulletLines.length * advance - CHIP.gap;
    els.push({
      h,
      gapAfter: GAP.bulletsToBody,
      draw: (y) => {
        let yy = y;
        const parts: string[] = [];
        for (const ln of bulletLines) {
          const c = chipLine(ln.text, ln.x, yy, size, WEIGHT.chip);
          const w = o.measure(ln.text, size, WEIGHT.chip) + 2 * CHIP.padX;
          parts.push(c.svg.replace('__W__', String(r2(w))));
          yy += advance;
        }
        return parts.join('');
      },
    });
  }

  if (slide.bodyAfter.trim()) {
    const outro = bodyBlock(slide.bodyAfter, m, SIZE.slideBody, L.marginX, L.maxTextW);
    els.push({ h: outro.height, gapAfter: 0, draw: (y) => emitBlock(outro, y, SIZE.slideBody, WEIGHT.body, COLORS.body) });
  }

  const start = placeStart(els, L.vstrategy === 'top' ? 'top' : 'center', L.topAnchor);
  return stack(els, start);
}

function renderTextWithImage(slide: LabSlide, o: BuildOpts): string {
  const pos = slide.picturePosition;
  if (pos === 'up' || pos === 'down' || pos === 'middle') {
    const slot = pos === 'up' ? SLOTS.textImageUp : pos === 'down' ? SLOTS.textImageDown : { x: 76, y: 500, w: 928, h: 350 };
    const img = slotImage(slot, slide.images[0], 'cover', o);
    let region: [number, number];
    if (pos === 'up') region = [675 + IMAGE_HALF_PAD, H - IMAGE_HALF_PAD];
    else if (pos === 'down') region = [IMAGE_HALF_PAD, 675 - IMAGE_HALF_PAD];
    else region = [IMAGE_HALF_PAD, 500 - IMAGE_HALF_PAD];
    const text =
      slide.subtype === 'paragraph'
        ? renderTextParagraph(slide, o, region, 'center', 0)
        : // list with image: place list top-anchored in the region
          renderListInRegion(slide, o, region, slide.subtype === 'numbered');
    // middle also needs bottom body — keep simple: middle renders text in top region only
    return img + text;
  }
  // none
  if (slide.subtype === 'paragraph') return renderTextParagraph(slide, o, [0, H], 'center', 0);
  return renderTextList(slide, o, slide.subtype === 'numbered');
}

function renderListInRegion(slide: LabSlide, o: BuildOpts, region: [number, number], numbered: boolean): string {
  // reuse list renderer but confined vertically by top-anchoring within region
  const L = LAYOUT.bullets;
  const m = o.measure;
  const els: El[] = [];
  const titleB = headingBlock(slide.title, m, SIZE.slideTitle, WEIGHT.title, L.marginX, L.maxTextW);
  els.push({ h: titleB.height, gapAfter: GAP.slideTitleToBody, draw: (y) => emitBlock(titleB, y, SIZE.slideTitle, WEIGHT.title, COLORS.title) });
  // intro paragraph ("над списком") — was previously dropped for image variants.
  if (slide.body.trim()) {
    const intro = bodyBlock(slide.body, m, SIZE.slideBody, L.marginX, L.maxTextW);
    els.push({ h: intro.height, gapAfter: GAP.titleToBullets, draw: (y) => emitBlock(intro, y, SIZE.slideBody, WEIGHT.body, COLORS.body) });
  }
  const size = SIZE.bullet;
  const cap = size * CAP;
  const lineH = Math.round(cap + 2 * CHIP.padY);
  const advance = lineH + CHIP.gap;
  const bullets = slide.bullets.filter((b) => b.trim());
  const bulletLines: { text: string; x: number }[] = [];
  bullets.forEach((item, i) => {
    const prefix = numbered ? `${i + 1}. ` : '• ';
    wrapBullet(item, prefix, m, size, WEIGHT.chip, L.marginX + CHIP.padX, L.maxTextW - CHIP.padX).forEach((ln) => bulletLines.push(ln));
  });
  if (bulletLines.length) {
    const h = bulletLines.length * advance - CHIP.gap;
    els.push({
      h,
      gapAfter: 0,
      draw: (y) => {
        let yy = y;
        const parts: string[] = [];
        for (const ln of bulletLines) {
          const c = chipLine(ln.text, ln.x, yy, size, WEIGHT.chip);
          const w = o.measure(ln.text, size, WEIGHT.chip) + 2 * CHIP.padX;
          parts.push(c.svg.replace('__W__', String(r2(w))));
          yy += advance;
        }
        return parts.join('');
      },
    });
  }
  // outro paragraph ("під списком") — also previously dropped for image variants.
  if (slide.bodyAfter.trim()) {
    const outro = bodyBlock(slide.bodyAfter, m, SIZE.slideBody, L.marginX, L.maxTextW);
    if (els.length) els[els.length - 1].gapAfter = GAP.bulletsToBody;
    els.push({ h: outro.height, gapAfter: 0, draw: (y) => emitBlock(outro, y, SIZE.slideBody, WEIGHT.body, COLORS.body) });
  }
  return stack(els, region[0] + IMAGE_HALF_PAD);
}

function renderNumbers(slide: LabSlide, o: BuildOpts): string {
  const m = o.measure;
  const els: El[] = [];
  // Single centered number + label (only one number layout; no size variant).
  const value = slide.statValue || '0';
  const numMaxW = 920;
  let fitSize = SIZE.statLarge;
  while (fitSize > 60 && m(value, fitSize, WEIGHT.title) > numMaxW) fitSize -= 4;
  const numBaseline = fitSize * 0.75;
  els.push({
    h: Math.round(fitSize * CAP),
    gapAfter: GAP.statToLabel,
    draw: (y) => `<text x="${W / 2}" y="${r2(y + numBaseline)}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="${fitSize}" font-weight="${WEIGHT.title}" fill="${COLORS.title}">${esc(value)}</text>`,
  });
  if (slide.body.trim()) {
    const labW = 888;
    const labMargin = Math.round((W - labW) / 2);
    const b = bodyBlock(slide.body, m, SIZE.slideBody, labMargin, labW, 'center');
    els.push({ h: b.height, gapAfter: 0, draw: (y) => emitBlock(b, y, SIZE.slideBody, WEIGHT.body, COLORS.body) });
  }
  return stack(els, placeStart(els, 'center', 0));
}

function renderCta(slide: LabSlide, o: BuildOpts): string {
  const L = LAYOUT.cta;
  const m = o.measure;
  const els: El[] = [];
  const titleB = headingBlock(slide.title, m, SIZE.slideTitle, WEIGHT.title, L.marginX, L.maxTextW);
  els.push({ h: titleB.height, gapAfter: GAP.ctaLineGap, draw: (y) => emitBlock(titleB, y, SIZE.slideTitle, WEIGHT.title, COLORS.title) });

  if (slide.subtype === 'keyword') {
    const kw = up(`“${(slide.ctaKeyword || '').trim()}”`);
    const size = SIZE.ctaKeyword;
    const cap = size * CAP;
    const padX = 28;
    const padY = 14;
    const h = Math.round(cap + 2 * padY);
    els.push({
      h,
      gapAfter: GAP.ctaLineGap + 6,
      draw: (y) => {
        const wtext = m(kw, size, WEIGHT.title);
        // Box left-aligned with the title's left edge (marginX); text inset by padX.
        return (
          `<rect x="${r2(L.marginX)}" y="${r2(y)}" width="${r2(wtext + 2 * padX)}" height="${h}" rx="${CHIP.radius}" fill="${COLORS.chipFill}"/>` +
          `<text x="${r2(L.marginX + padX)}" y="${r2(y + padY + cap)}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="${WEIGHT.title}" fill="${COLORS.chipText}">${esc(kw)}</text>`
        );
      },
    });
  } else {
    // action-with-icons — 4 PARKED placeholder circles
    els.push({
      h: CTA_ICONS.radius * 2,
      gapAfter: GAP.iconsToBody,
      draw: (y) => {
        const cy = y + CTA_ICONS.radius;
        return CTA_ICONS.centersX
          .map((cx) => `<circle cx="${cx}" cy="${r2(cy)}" r="${CTA_ICONS.radius}" fill="none" stroke="${COLORS.icon}" stroke-width="${CTA_ICONS.strokeW}"/>`)
          .join('');
      },
    });
  }

  if (slide.body.trim()) {
    const b = bodyBlock(slide.body, m, SIZE.slideBody, L.marginX, L.maxTextW);
    els.push({ h: b.height, gapAfter: 0, draw: (y) => emitBlock(b, y, SIZE.slideBody, WEIGHT.body, COLORS.body) });
  }
  return stack(els, placeStart(els, 'center', 0));
}

function renderScreenshot(slide: LabSlide, o: BuildOpts): string {
  const L = LAYOUT.testimonial;
  const m = o.measure;
  const els: El[] = [];
  const titleB = headingBlock(slide.title, m, SIZE.slideTitle, WEIGHT.title, L.marginX, L.maxTextW);
  els.push({ h: titleB.height, gapAfter: GAP.titleToImage, draw: (y) => emitBlock(titleB, y, SIZE.slideTitle, WEIGHT.title, COLORS.title) });
  const slot = SLOTS.screenshot;
  els.push({
    h: slot.h,
    gapAfter: GAP.imageToBody,
    draw: (y) => slotImage({ ...slot, y }, slide.images[0], 'contain', o),
  });
  if (slide.body.trim()) {
    const b = bodyBlock(slide.body, m, SIZE.slideBody, L.marginX, L.maxTextW);
    els.push({ h: b.height, gapAfter: 0, draw: (y) => emitBlock(b, y, SIZE.slideBody, WEIGHT.body, COLORS.body) });
  }
  return stack(els, placeStart(els, 'center', 0));
}

function renderBeforeAfter(slide: LabSlide, o: BuildOpts): string {
  const L = LAYOUT.testimonial;
  const m = o.measure;
  const slots = SLOTS.beforeAfter;
  const imgH = slots[0].h;
  const els: El[] = [];
  const titleB = headingBlock(slide.title || 'До та після:', m, SIZE.slideTitle, WEIGHT.title, LAYOUT.text.marginX, L.maxTextW);
  els.push({ h: titleB.height, gapAfter: GAP.titleToImage, draw: (y) => emitBlock(titleB, y, SIZE.slideTitle, WEIGHT.title, COLORS.title) });
  els.push({
    h: imgH,
    gapAfter: GAP.imageToBody,
    draw: (y) => slots.map((s, i) => slotImage({ ...s, y }, slide.images[i], 'cover', o)).join(''),
  });
  if (slide.body.trim()) {
    const b = bodyBlock(slide.body, m, SIZE.slideBody, LAYOUT.text.marginX, L.maxTextW);
    els.push({ h: b.height, gapAfter: 0, draw: (y) => emitBlock(b, y, SIZE.slideBody, WEIGHT.body, COLORS.body) });
  }
  return stack(els, placeStart(els, 'center', 0));
}

function renderPointAb(slide: LabSlide, o: BuildOpts): string {
  const m = o.measure;
  const slots = SLOTS.pointAbDiagonal;
  const P = POINT_AB_TEXT;
  const A = slide.points[0] ?? { label: 'Точка А:', text: '' };
  const B = slide.points[1] ?? { label: 'Точка Б:', text: '' };
  const parts: string[] = [];

  // Side A: label top-left, image left, text right column
  const aLabel = headingBlock(A.label, m, SIZE.slideTitle, WEIGHT.title, P.aLabelX, 600);
  parts.push(emitBlock(aLabel, P.aTopY, SIZE.slideTitle, WEIGHT.title, COLORS.title));
  parts.push(slotImage(slots[0], slide.images[0], 'cover', o));
  const aText = bodyBlock(A.text, m, SIZE.slideBody, P.aTextX, P.aTextW);
  parts.push(emitBlock(aText, slots[0].y + 8, SIZE.slideBody, WEIGHT.body, COLORS.body));

  // Side B: label left, text left column, image right
  const bLabel = headingBlock(B.label, m, SIZE.slideTitle, WEIGHT.title, P.bLabelX, 600);
  parts.push(emitBlock(bLabel, P.bTopY, SIZE.slideTitle, WEIGHT.title, COLORS.title));
  parts.push(slotImage(slots[1], slide.images[1], 'cover', o));
  const bText = bodyBlock(B.text, m, SIZE.slideBody, P.bTextX, P.bTextW);
  parts.push(emitBlock(bText, P.bTopY + Math.round(SIZE.slideTitle * LINE_HEIGHT.title) + 20, SIZE.slideBody, WEIGHT.body, COLORS.body));

  return parts.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
export function renderSlideBody(slide: LabSlide, o: BuildOpts): string {
  switch (slide.type) {
    case 'cover':
      return renderCover(slide, o);
    case 'text':
      return renderTextWithImage(slide, o);
    case 'numbers':
      return renderNumbers(slide, o);
    case 'cta':
      return renderCta(slide, o);
    case 'testimonial':
      if (slide.subtype === 'before_after') return renderBeforeAfter(slide, o);
      if (slide.subtype === 'point_ab') return renderPointAb(slide, o);
      return renderScreenshot(slide, o);
    default:
      return '';
  }
}

export function buildSlideSvg(slide: LabSlide, o: BuildOpts): string {
  const style = o.embedFontCss ? `<style>${o.embedFontCss}</style>` : '';
  const body = renderSlideBody(slide, o);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    style +
    `<rect width="${W}" height="${H}" fill="${COLORS.background}"/>` +
    body +
    `</svg>`
  );
}
