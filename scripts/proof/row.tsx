// Dev-only proof: render ContentRow for each type at various statuses + a long
// name (ellipsis), then screenshot in Chromium.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import ContentRow, { type ContentRowPiece } from '@/components/content/ContentRow';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });
const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const now = Date.now();

const pieces: ContentRowPiece[] = [
  { id: '1', type: 'carousel', status: 'design', title: 'Як ми втратили 700 клієнтів', updatedAt: new Date(now - 10_000).toISOString() },
  { id: '2', type: 'reel', status: 'script', title: 'Чому твій офер не працює', updatedAt: new Date(now - 2 * HOUR).toISOString() },
  { id: '3', type: 'story', status: 'film', title: 'Закулісся зйомки', updatedAt: new Date(now - DAY).toISOString() },
  { id: '4', type: 'idea', status: 'idea', title: 'Ідея про ретеншн і чому всі про це забувають', updatedAt: new Date(now - 3 * DAY).toISOString() },
  { id: '5', type: 'reel', status: 'published', title: 'Рілс який зібрав 2 млн переглядів', updatedAt: new Date(now - 10 * DAY).toISOString() },
  { id: '6', type: 'carousel', status: 'idea', title: 'Дуже довга назва контенту яка точно не вміститься в один рядок і має обрізатись трикрапкою в кінці', updatedAt: new Date(now - 40 * DAY).toISOString() },
];

const markup = renderToStaticMarkup(
  React.createElement(
    'div',
    { style: { maxWidth: 480, margin: '0 auto' } },
    ...pieces.map((p) => React.createElement(ContentRow, { key: p.id, piece: p })),
  ),
);

const face = (subset: string, weight: number) =>
  `@font-face{font-family:'Montserrat';font-weight:${weight};font-display:block;src:url('file://${join(FS, `montserrat-${subset}-${weight}-normal.woff2`)}') format('woff2');}`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///tmp/proof/tw.css">
<style>
${['latin', 'cyrillic'].flatMap((s) => [face(s, 400), face(s, 600), face(s, 700)]).join('')}
:root{--border:#ececec;--foreground:#141414;--surface:#f6f6f6;--background:#fff}
html,body{margin:0;padding:24px;background:#fff;font-family:'Montserrat',sans-serif}
</style></head><body><div id="root">${markup}</div></body></html>`;
writeFileSync(join(OUT, 'row.html'), html);

async function shoot() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 540, height: 520 }, deviceScaleFactor: 2 });
  await page.goto('file://' + join(OUT, 'row.html'));
  await page.waitForTimeout(400);
  const el = await page.$('#root');
  await (el ?? page).screenshot({ path: join(OUT, 'row.png') });
  await browser.close();
  console.log('wrote', join(OUT, 'row.png'));
}

shoot().catch((e) => {
  console.error(e);
  process.exit(1);
});
