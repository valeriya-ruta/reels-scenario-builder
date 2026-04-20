import type { SKRSContext2D } from '@napi-rs/canvas';
import type { BrandAccentStyle } from '@/lib/brand';
import type { AccentSegment } from '@/lib/carousel/accentSpans';

export function roundRectPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
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

export function drawMarkerHighlight(
  ctx: SKRSContext2D,
  seed: number,
  x: number,
  y: number,
  w: number,
  h: number,
  colorHex: string,
  opacity: number,
) {
  const rnd = seeded(seed);
  const step = 8;
  const jTop = () => (rnd() - 0.5) * 6;
  const jBot = () => (rnd() - 0.5) * 8;
  const jSide = () => (rnd() - 0.5) * 4;
  const rot = ((rnd() - 0.5) * 2.4 * Math.PI) / 180;

  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.translate(-cx, -cy);

  const pts: [number, number][] = [];
  let px = x + jSide();
  const y0 = y + jTop();
  pts.push([px, y0]);
  while (px < x + w) {
    px = Math.min(px + step, x + w);
    pts.push([px, y + jTop()]);
  }
  px = x + w + jSide();
  let py = y0 + step;
  while (py < y + h) {
    py = Math.min(py + step, y + h);
    pts.push([x + w + jSide() * 0.5, py]);
  }
  py = y + h + jBot();
  pts.push([x + w, py]);
  px = x + w;
  while (px > x) {
    px = Math.max(px - step, x);
    pts.push([px, y + h + jBot()]);
  }
  px = x + jSide();
  py = y + h - step;
  while (py > y) {
    py = Math.max(py - step, y);
    pts.push([x + jSide() * 0.5, py]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  const { r, g, b } = hexToRgb(colorHex);
  ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`;
  ctx.fill();
  ctx.restore();
}

export type WordToken = { text: string; isAccent: boolean };

export function segmentsToWords(segments: AccentSegment[]): WordToken[] {
  const out: WordToken[] = [];
  for (const seg of segments) {
    const parts = seg.text.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) {
        if (out.length) out[out.length - 1].text += p;
        else out.push({ text: p, isAccent: seg.isAccent });
      } else {
        out.push({ text: p, isAccent: seg.isAccent });
      }
    }
  }
  return out;
}

export function layoutWords(
  measure: (t: string) => number,
  words: WordToken[],
  maxWidth: number,
): WordToken[][] {
  const lines: WordToken[][] = [];
  let cur: WordToken[] = [];
  let lineW = 0;
  for (const w of words) {
    const wW = measure(w.text);
    if (lineW + wW > maxWidth && cur.length) {
      lines.push(cur);
      cur = [{ ...w }];
      lineW = measure(w.text);
    } else {
      cur.push({ ...w });
      lineW += wW;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/**
 * @param plainBaseIsBold — legacy slide title uses bold Noto for non-accent runs; template body/title use regular sans for plain.
 */
export function drawSegmentedLine(
  ctx: SKRSContext2D,
  line: WordToken[],
  x: number,
  y: number,
  fontSize: number,
  baseColor: string,
  accentColor: string,
  accentStyle: BrandAccentStyle,
  align: 'left' | 'center' | 'right',
  maxWidth: number,
  refinedNoAccent: boolean,
  seedBase: number,
  plainBaseIsBold = false,
) {
  const measure = (txt: string, bold: boolean, italic: boolean) => {
    ctx.font = bold
      ? `${italic ? 'italic ' : ''}bold ${fontSize}px NotoSansBold`
      : `${italic ? 'italic ' : ''}${fontSize}px NotoSans`;
    return ctx.measureText(txt).width;
  };

  const tokenWidth = (tok: WordToken) => {
    const useA = tok.isAccent && !refinedNoAccent;
    if (!useA && plainBaseIsBold) {
      ctx.font = `${fontSize}px NotoSansBold`;
      return ctx.measureText(tok.text).width;
    }
    const b = useA && accentStyle === 'bold';
    const it = useA && accentStyle === 'italic';
    return measure(tok.text, b, it);
  };

  const fullW = line.reduce((acc, t) => acc + tokenWidth(t), 0);
  let startX = x;
  if (align === 'center') startX = x + (maxWidth - fullW) / 2;
  if (align === 'right') startX = x + maxWidth - fullW;

  let cx = startX;
  for (let i = 0; i < line.length; i++) {
    const tok = line[i];
    const useAccent = tok.isAccent && !refinedNoAccent;
    const bold = useAccent && accentStyle === 'bold';
    const italic = useAccent && accentStyle === 'italic';
    const text = tok.text;
    const w = tokenWidth(tok);

    if (useAccent && (accentStyle === 'pill' || accentStyle === 'rectangle')) {
      const padX = 16;
      const padY = 8;
      const br = accentStyle === 'pill' ? fontSize * 0.35 : 0;
      const { r, g, b } = hexToRgb(accentColor);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      if (br > 0) roundRectPath(ctx, cx - padX, y - fontSize - padY + 4, w + padX * 2, fontSize + padY * 2, br);
      else ctx.fillRect(cx - padX, y - fontSize - padY + 4, w + padX * 2, fontSize + padY * 2);
      ctx.fill();
      ctx.font = `${fontSize}px NotoSansBold`;
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, cx, y);
    } else if (useAccent && accentStyle === 'marker') {
      drawMarkerHighlight(ctx, seedBase + i * 17, cx - 2, y - fontSize * 0.85, w + 4, fontSize * 0.72, accentColor, 0.38);
      ctx.font = `${fontSize}px NotoSans`;
      const { r, g, b } = hexToRgb(baseColor);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, cx, y);
    } else if (!useAccent && plainBaseIsBold) {
      ctx.font = `${fontSize}px NotoSansBold`;
      const { r, g, b } = hexToRgb(baseColor);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, cx, y);
    } else {
      ctx.font = bold
        ? `${italic ? 'italic ' : ''}bold ${fontSize}px NotoSansBold`
        : italic
          ? `italic ${fontSize}px NotoSansItalic`
          : `${fontSize}px NotoSans`;
      const { r, g, b } = hexToRgb(useAccent ? accentColor : baseColor);
      if (refinedNoAccent && tok.isAccent) {
        const bb = hexToRgb(baseColor);
        ctx.fillStyle = `rgb(${bb.r},${bb.g},${bb.b})`;
      } else {
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      }
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, cx, y);
    }
    cx += w;
  }
}
