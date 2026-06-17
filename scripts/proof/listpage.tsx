// Dev-only proof: the carousel list page with the new status-row UI
// (header + create button + ContentRow rows). Presentational ContentRow (the
// interactive ContentRows needs a router).
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
const H = 3600_000, D = 24 * H;

const pieces: ContentRowPiece[] = [
  { id: '1', type: 'carousel', status: 'design', title: 'Як ми втратили 700 клієнтів', updatedAt: new Date(now - 20_000).toISOString() },
  { id: '2', type: 'carousel', status: 'ready', title: '5 кроків до першого продажу', updatedAt: new Date(now - 3 * H).toISOString() },
  { id: '3', type: 'carousel', status: 'script', title: 'Чек-лист запуску', updatedAt: new Date(now - D).toISOString() },
  { id: '4', type: 'carousel', status: 'published', title: 'Кейс: x3 за місяць', updatedAt: new Date(now - 9 * D).toISOString() },
  { id: '5', type: 'carousel', status: 'idea', title: 'Чернетка без назви', updatedAt: new Date(now - 30 * D).toISOString() },
];

const markup = renderToStaticMarkup(
  React.createElement('div', { style: { maxWidth: 460, margin: '0 auto', padding: '32px 16px', background: '#fff', fontFamily: "'Montserrat',sans-serif" } },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 } },
      React.createElement('h1', { style: { fontSize: 24, fontWeight: 600, margin: 0 } }, 'Мої каруселі'),
      React.createElement('span', { style: { background: '#004BA8', color: '#fff', borderRadius: 12, padding: '8px 14px', fontSize: 14, fontWeight: 600 } }, '+ Нова карусель')),
    ...pieces.map((p) => React.createElement(ContentRow, { key: p.id, piece: p })),
  ),
);

const face = (s: string, w: number) => `@font-face{font-family:'Montserrat';font-weight:${w};src:url('file://${join(FS, `montserrat-${s}-${w}-normal.woff2`)}') format('woff2');}`;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///tmp/proof/tw.css">
<style>${['latin', 'cyrillic'].flatMap((s) => [face(s, 400), face(s, 600), face(s, 700)]).join('')}
:root{--border:#ececec;--foreground:#141414;--surface:#f6f6f6;--background:#fff}
html,body{margin:0;padding:0}</style></head><body><div id="root">${markup}</div></body></html>`;
writeFileSync(join(OUT, 'listpage.html'), html);

async function shoot() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage({ deviceScaleFactor: 2 });
  await p.goto('file://' + join(OUT, 'listpage.html'));
  await p.waitForTimeout(400);
  const el = await p.$('#root > *');
  await (el ?? p).screenshot({ path: join(OUT, 'carousel-list.png') });
  await browser.close();
  console.log('wrote', join(OUT, 'carousel-list.png'));
}
shoot().catch((e) => { console.error(e); process.exit(1); });
