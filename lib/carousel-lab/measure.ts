// Browser text measurement bound to GoogleSansElegant. Used to bake wrap/justify
// geometry into the SVG so the editor and the exported PNG are pixel-identical.
'use client';

import { FONT_FAMILY } from './tokens';
import type { Measure } from './textLayout';

let ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D {
  if (ctx) return ctx;
  const canvas = document.createElement('canvas');
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D canvas unavailable');
  ctx = c;
  return c;
}

export type Measurer = (text: string, fontPx: number, weight: number) => number;

export function getMeasurer(): Measurer {
  const c = getCtx();
  return (text, fontPx, weight) => {
    c.font = `${weight} ${fontPx}px '${FONT_FAMILY}'`;
    return c.measureText(text).width;
  };
}

/** Bind a measurer to a fixed size/weight (the shape textLayout expects). */
export function bindMeasure(m: Measurer, fontPx: number, weight: number): Measure {
  return (t: string) => m(t, fontPx, weight);
}
