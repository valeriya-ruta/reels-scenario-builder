// Dev-only proof: Home "Твій контент" recents section — header + "Усі →" + the
// latest few status rows (presentational ContentRow, since ContentRows needs a router).
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
  { id: '1', type: 'carousel', status: 'design', title: 'Як ми втратили 700 клієнтів', updatedAt: new Date(now - 30_000).toISOString() },
  { id: '2', type: 'reel', status: 'script', title: 'Чому твій офер не працює', updatedAt: new Date(now - 90 * 60_000).toISOString() },
  { id: '3', type: 'idea', status: 'idea', title: 'Думка про ретеншн', updatedAt: new Date(now - 5 * H).toISOString() },
  { id: '4', type: 'story', status: 'film', title: 'Закулісся зйомки', updatedAt: new Date(now - D).toISOString() },
];

const section = React.createElement('section', { style: { } },
  React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 } },
    React.createElement('h2', { style: { fontSize: 18, fontWeight: 600, margin: 0 } }, 'Твій контент'),
    React.createElement('a', { style: { fontSize: 14, fontWeight: 500, color: '#004BA8' } }, 'Усі →')),
  ...pieces.map((p) => React.createElement(ContentRow, { key: p.id, piece: p })),
);

const markup = renderToStaticMarkup(
  React.createElement('div', { style: { maxWidth: 430, margin: '0 auto', padding: '28px 16px', background: '#fff', fontFamily: "'Montserrat',sans-serif" } },
    React.createElement('p', { style: { fontSize: 22, fontWeight: 700, margin: '0 0 24px' } }, 'Доброго ранку 👋'),
    section,
  ),
);

const face = (s: string, w: number) => `@font-face{font-family:'Montserrat';font-weight:${w};src:url('file://${join(FS, `montserrat-${s}-${w}-normal.woff2`)}') format('woff2');}`;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///tmp/proof/tw.css">
<style>${['latin', 'cyrillic'].flatMap((s) => [face(s, 400), face(s, 600), face(s, 700)]).join('')}
:root{--border:#ececec;--foreground:#141414;--surface:#f6f6f6;--background:#fff}
html,body{margin:0;padding:0}</style></head><body><div id="root">${markup}</div></body></html>`;
writeFileSync(join(OUT, 'homerecents.html'), html);

async function shoot() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage({ deviceScaleFactor: 2 });
  await p.goto('file://' + join(OUT, 'homerecents.html'));
  await p.waitForTimeout(400);
  const el = await p.$('#root > *');
  await (el ?? p).screenshot({ path: join(OUT, 'home-recents.png') });
  await browser.close();
  console.log('wrote', join(OUT, 'home-recents.png'));
}
shoot().catch((e) => { console.error(e); process.exit(1); });
