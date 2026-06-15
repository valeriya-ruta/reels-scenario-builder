// Dev-only proof: the full "Твій контент" page — populated (header + rows) and
// the empty state — screenshot at phone width. Uses presentational ContentRow
// directly (ContentRows needs a router) since this proves layout, not wiring.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import ContentRow, { type ContentRowPiece } from '@/components/content/ContentRow';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });
const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');
const now = Date.now();
const H = 3600_000;
const D = 24 * H;

const pieces: ContentRowPiece[] = [
  { id: '1', type: 'carousel', status: 'design', title: 'Як ми втратили 700 клієнтів', updatedAt: new Date(now - 30_000).toISOString() },
  { id: '2', type: 'reel', status: 'script', title: 'Чому твій офер не працює', updatedAt: new Date(now - 90 * 60_000).toISOString() },
  { id: '3', type: 'idea', status: 'idea', title: 'Думка про ретеншн і чому всі забувають', updatedAt: new Date(now - 5 * H).toISOString() },
  { id: '4', type: 'story', status: 'film', title: 'Закулісся зйомки', updatedAt: new Date(now - D).toISOString() },
  { id: '5', type: 'reel', status: 'published', title: 'Рілс який зібрав 2 млн переглядів', updatedAt: new Date(now - 8 * D).toISOString() },
  { id: '6', type: 'carousel', status: 'ready', title: '5 кроків до першого продажу', updatedAt: new Date(now - 21 * D).toISOString() },
];

const page = (inner: React.ReactNode) =>
  React.createElement('div', { style: { background: '#fff', minHeight: 700 } },
    React.createElement('div', { style: { maxWidth: 640, margin: '0 auto', padding: '32px 16px' } },
      React.createElement('h1', { style: { fontSize: 24, fontWeight: 600, margin: '0 0 16px' } }, 'Твій контент'),
      inner));

const populated = page(
  React.createElement('div', { 'data-testid': 'content-list' },
    ...pieces.map((p) => React.createElement(ContentRow, { key: p.id, piece: p })),
  ),
);

const empty = page(
  React.createElement('div',
    { style: { marginTop: 40, borderRadius: 16, background: '#f6f6f6', padding: '48px 24px', textAlign: 'center' } },
    React.createElement('p', { style: { fontSize: 16, fontWeight: 600, margin: 0 } }, 'Тут житиме твій контент'),
    React.createElement('p', { style: { fontSize: 14, color: '#888', maxWidth: 320, margin: '8px auto 0', lineHeight: 1.5 } },
      'Кинь ідею, збери карусель чи рілс — і все зʼявиться тут, від першої думки до «Опубліковано».'),
  ),
);

const markup = renderToStaticMarkup(
  React.createElement('div', { style: { display: 'flex', gap: 24, background: '#ddd', padding: 24 } },
    React.createElement('div', { style: { width: 430, background: '#fff' } }, populated),
    React.createElement('div', { style: { width: 430, background: '#fff' } }, empty),
  ),
);

const face = (s: string, w: number) =>
  `@font-face{font-family:'Montserrat';font-weight:${w};src:url('file://${join(FS, `montserrat-${s}-${w}-normal.woff2`)}') format('woff2');}`;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///tmp/proof/tw.css">
<style>${['latin', 'cyrillic'].flatMap((s) => [face(s, 400), face(s, 600), face(s, 700)]).join('')}
:root{--border:#ececec;--foreground:#141414;--surface:#f6f6f6;--background:#fff}
html,body{margin:0;padding:0;font-family:'Montserrat',sans-serif}</style></head><body><div id="root">${markup}</div></body></html>`;
writeFileSync(join(OUT, 'library.html'), html);

async function shoot() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage({ deviceScaleFactor: 2 });
  await p.goto('file://' + join(OUT, 'library.html'));
  await p.waitForTimeout(400);
  const el = await p.$('#root > *');
  await (el ?? p).screenshot({ path: join(OUT, 'library.png') });
  await browser.close();
  console.log('wrote', join(OUT, 'library.png'));
}
shoot().catch((e) => { console.error(e); process.exit(1); });
