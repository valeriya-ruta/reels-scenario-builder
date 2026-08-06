// ─────────────────────────────────────────────────────────────────────────────
// Text layout: word-wrap + justification with baked per-word x positions.
// Positions are computed once (browser canvas metrics) and written into the SVG,
// so the editor's inline SVG and the exported rasterization are pixel-identical.
// ─────────────────────────────────────────────────────────────────────────────

/** A measure fn already bound to a specific font family / weight / size. */
export type Measure = (text: string) => number;

export type PlacedWord = { text: string; x: number };
export type PlacedLine = { baseline: number; words: PlacedWord[] };
export type TextBlock = { lines: PlacedLine[]; height: number };

/** Cap height as a fraction of font size. Baselines are cap-aligned: a block's
 *  first line has its CAP TOP at the block top (y=0), so a block's rendered
 *  height equals the last line's baseline (its cap bottom). Stacking blocks with
 *  a fixed gap then yields that exact visual gap between cap-bottom and cap-top. */
const CAP_RATIO = 0.72;

function splitWords(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

/** Greedy wrap into lines that fit `maxWidth`. */
function wrapLine(words: string[], measure: Measure, spaceW: number, maxWidth: number): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  let curW = 0;
  for (const w of words) {
    const ww = measure(w);
    const add = cur.length === 0 ? ww : curW + spaceW + ww;
    if (cur.length > 0 && add > maxWidth) {
      lines.push(cur);
      cur = [w];
      curW = ww;
    } else {
      cur.push(w);
      curW = add;
    }
  }
  if (cur.length) lines.push(cur);
  return lines.length ? lines : [[]];
}

export type LayoutOpts = {
  measure: Measure;
  fontPx: number;
  lineHeight: number; // px
  maxWidth: number;
  marginX: number;
  /** 'left' | 'center' | 'justify' — justify stretches every line except a paragraph's last. */
  align: 'left' | 'center' | 'justify';
};

/**
 * Lay out one or more paragraphs (separated by blank lines in `text`) into a
 * single block. Returns placed lines with absolute x per word and baseline y
 * measured from the block top (add the block's top Y to render).
 */
export function layoutParagraphs(text: string, opts: LayoutOpts, paragraphGapPx: number): TextBlock {
  const { measure, fontPx, lineHeight, maxWidth, marginX, align } = opts;
  const spaceW = Math.max(1, measure(' ') || fontPx * 0.28);
  const cap = fontPx * CAP_RATIO;

  const paragraphs = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+/g, ' ').trim());

  const lines: PlacedLine[] = [];
  let y = 0; // top of current line box
  let first = true;
  let lastBaseline = 0;

  for (const para of paragraphs) {
    if (!first) y += paragraphGapPx; // blank-line gap between paragraphs
    first = false;
    const words = splitWords(para);
    if (words.length === 0) {
      // preserve an intentional empty paragraph as vertical space
      y += lineHeight;
      continue;
    }
    const wrapped = wrapLine(words, measure, spaceW, maxWidth);
    wrapped.forEach((lineWords, li) => {
      const isLast = li === wrapped.length - 1;
      const placed = placeWords(lineWords, measure, spaceW, maxWidth, marginX, align, isLast);
      // cap-aligned: first line's cap top sits at the line box top.
      lastBaseline = y + cap;
      lines.push({ baseline: lastBaseline, words: placed });
      y += lineHeight;
    });
  }

  // Height = cap bottom of the last line, so a following block placed at
  // height + 36 sits exactly 36px below this block's last text.
  return { lines, height: lastBaseline };
}

function placeWords(
  words: string[],
  measure: Measure,
  spaceW: number,
  maxWidth: number,
  marginX: number,
  align: 'left' | 'center' | 'justify',
  isLast: boolean,
): PlacedWord[] {
  if (words.length === 0) return [];
  const widths = words.map(measure);
  const sum = widths.reduce((a, b) => a + b, 0);

  // Justify: only interior lines with ≥2 words; last line + single word stay left.
  const doJustify = align === 'justify' && !isLast && words.length > 1;
  const gap = doJustify ? (maxWidth - sum) / (words.length - 1) : spaceW;

  // Center: shift the whole line so it's centered within [marginX, marginX+maxWidth].
  const lineW = sum + spaceW * (words.length - 1);
  let x = align === 'center' ? marginX + Math.max(0, (maxWidth - lineW) / 2) : marginX;

  const placed: PlacedWord[] = [];
  words.forEach((w, i) => {
    placed.push({ text: w, x: Math.round(x * 100) / 100 });
    x += widths[i] + gap;
  });
  return placed;
}

/** Single left-aligned line (title/label); returns block with one+ wrapped lines. */
export function layoutHeading(text: string, opts: Omit<LayoutOpts, 'align'>): TextBlock {
  return layoutParagraphs(text, { ...opts, align: 'left' }, 0);
}
