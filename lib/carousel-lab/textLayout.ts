// ─────────────────────────────────────────────────────────────────────────────
// Text layout: word-wrap + justification with baked per-word x positions.
// Positions are computed once (browser canvas metrics) and written into the SVG,
// so the editor's inline SVG and the exported rasterization are pixel-identical.
// Accent runs are marked in the source with {curly braces} and carried per word
// so the renderer can draw a white chip behind exactly those words.
// ─────────────────────────────────────────────────────────────────────────────

/** A measure fn already bound to a specific font family / weight / size. */
export type Measure = (text: string) => number;

export type PlacedWord = { text: string; x: number; w: number; accent?: boolean };
export type PlacedLine = { baseline: number; words: PlacedWord[] };
export type TextBlock = { lines: PlacedLine[]; height: number };

type Tok = { text: string; accent: boolean };

/** Cap height as a fraction of font size (see numbers/gap notes in buildSlideSvg). */
const CAP_RATIO = 0.72;

/** Split a paragraph into words, tagging each word inside {…} as accent. */
function tokenizeAccent(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /\{([^}]*)\}|([^{}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const accent = m[1] !== undefined;
    const chunk = (accent ? m[1] : m[2]) ?? '';
    for (const w of chunk.split(/\s+/).filter(Boolean)) out.push({ text: w, accent });
  }
  return out;
}

/** Greedy wrap into lines that fit `maxWidth`. */
function wrapLine(words: Tok[], measure: Measure, spaceW: number, maxWidth: number): Tok[][] {
  const lines: Tok[][] = [];
  let cur: Tok[] = [];
  let curW = 0;
  for (const word of words) {
    const ww = measure(word.text);
    const add = cur.length === 0 ? ww : curW + spaceW + ww;
    if (cur.length > 0 && add > maxWidth) {
      lines.push(cur);
      cur = [word];
      curW = ww;
    } else {
      cur.push(word);
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
    if (!first) y += paragraphGapPx;
    first = false;
    const words = tokenizeAccent(para);
    if (words.length === 0) {
      y += lineHeight;
      continue;
    }
    const wrapped = wrapLine(words, measure, spaceW, maxWidth);
    wrapped.forEach((lineWords, li) => {
      const isLast = li === wrapped.length - 1;
      const placed = placeWords(lineWords, measure, spaceW, maxWidth, marginX, align, isLast);
      lastBaseline = y + cap;
      lines.push({ baseline: lastBaseline, words: placed });
      y += lineHeight;
    });
  }

  return { lines, height: lastBaseline };
}

function placeWords(
  words: Tok[],
  measure: Measure,
  spaceW: number,
  maxWidth: number,
  marginX: number,
  align: 'left' | 'center' | 'justify',
  isLast: boolean,
): PlacedWord[] {
  if (words.length === 0) return [];
  const widths = words.map((w) => measure(w.text));
  const sum = widths.reduce((a, b) => a + b, 0);

  const doJustify = align === 'justify' && !isLast && words.length > 1;
  const gap = doJustify ? (maxWidth - sum) / (words.length - 1) : spaceW;

  const lineW = sum + spaceW * (words.length - 1);
  let x = align === 'center' ? marginX + Math.max(0, (maxWidth - lineW) / 2) : marginX;

  const placed: PlacedWord[] = [];
  words.forEach((w, i) => {
    placed.push({ text: w.text, x: Math.round(x * 100) / 100, w: widths[i], accent: w.accent });
    x += widths[i] + gap;
  });
  return placed;
}

/** Single left-aligned line (title/label); returns block with one+ wrapped lines. */
export function layoutHeading(text: string, opts: Omit<LayoutOpts, 'align'>): TextBlock {
  return layoutParagraphs(text, { ...opts, align: 'left' }, 0);
}
