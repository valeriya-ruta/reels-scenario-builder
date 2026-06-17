// Dev-only proof: the Create FAB menu OPEN, showing the L-shape. Uses the REAL
// bubblePositions() geometry from the component on a phone-sized frame, with the
// same bubble style (colored circle + label above). CreateRadialMenu itself uses
// a client-only portal scrim, so we render a faithful replica of its output.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { bubblePositions, RADIAL_OPTIONS } from '@/components/CreateRadialMenu';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });
const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');

const VW = 390, VH = 844;
const anchor = { x: VW / 2, y: VH - 46 }; // FAB centre ~46px above the bottom
const positions = bubblePositions(anchor);
const BUBBLE = 46, COL = 72, ICON_OFFSET = 16 + 4 + BUBBLE / 2;

const bubbles = positions.map((pos, i) => {
  const opt = RADIAL_OPTIONS[i];
  return React.createElement('div', {
    key: opt.id,
    style: { position: 'absolute', left: pos.x, top: pos.y, width: COL, marginLeft: -COL / 2, marginTop: -ICON_OFFSET, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  },
    React.createElement('span', { style: { fontSize: 11, fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.55)', lineHeight: 1 } }, opt.label),
    React.createElement('span', { style: { width: BUBBLE, height: BUBBLE, borderRadius: 999, background: opt.color, boxShadow: '0 4px 13px rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20 } }, '●'),
  );
});

const fab = React.createElement('div', {
  style: { position: 'absolute', left: anchor.x, top: anchor.y, width: 56, height: 56, marginLeft: -28, marginTop: -28, borderRadius: 999, background: '#0C447C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, boxShadow: '0 6px 18px rgba(0,0,0,0.3)' } },
  '×');

const markup = renderToStaticMarkup(
  React.createElement('div', { style: { position: 'relative', width: VW, height: VH, background: '#1f2024', overflow: 'hidden', fontFamily: "'Montserrat',sans-serif" } },
    // scrim tint
    React.createElement('div', { style: { position: 'absolute', inset: 0, background: 'rgba(20,20,30,0.55)' } }),
    ...bubbles,
    fab,
  ),
);

const face = (s: string, w: number) => `@font-face{font-family:'Montserrat';font-weight:${w};src:url('file://${join(FS, `montserrat-${s}-${w}-normal.woff2`)}') format('woff2');}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${['latin', 'cyrillic'].flatMap((s) => [face(s, 400), face(s, 600)]).join('')}html,body{margin:0;padding:0}</style></head><body><div id="root">${markup}</div></body></html>`;
writeFileSync(join(OUT, 'fab.html'), html);

async function shoot() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
  await p.goto('file://' + join(OUT, 'fab.html'));
  await p.waitForTimeout(300);
  await p.screenshot({ path: join(OUT, 'fab-lshape.png') });
  await browser.close();
  console.log('wrote', join(OUT, 'fab-lshape.png'), 'positions:', JSON.stringify(positions.map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y) }))));
}
shoot().catch((e) => { console.error(e); process.exit(1); });
