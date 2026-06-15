// Dev-only proof: render StatusRing across every track stage + the published
// disc + the idea sliver, then screenshot the grid in Chromium.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import StatusRing from '@/components/content/StatusRing';
import {
  STATUS_LABELS,
  TYPE_LABELS,
  TYPE_TRACKS,
  type ContentStatus,
  type ContentType,
} from '@/lib/content/statusSystem';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });

const rows: { type: ContentType; label: string; statuses: ContentStatus[] }[] = [
  { type: 'reel', label: TYPE_LABELS.reel, statuses: [...TYPE_TRACKS.reel] },
  { type: 'carousel', label: TYPE_LABELS.carousel, statuses: [...TYPE_TRACKS.carousel] },
  { type: 'story', label: TYPE_LABELS.story, statuses: [...TYPE_TRACKS.story] },
  { type: 'idea', label: TYPE_LABELS.idea, statuses: ['idea'] },
];

function cell(type: ContentType, status: ContentStatus) {
  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 96 } },
    React.createElement(StatusRing, { type, status, size: 36, animate: false }),
    React.createElement('div', { style: { fontSize: 12, color: '#444' } }, STATUS_LABELS[status]),
  );
}

const grid = rows.map((row) =>
  React.createElement(
    'div',
    { key: row.type, style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 } },
    React.createElement('div', { style: { width: 110, fontWeight: 700, fontSize: 14 } }, row.label),
    ...row.statuses.map((s) => cell(row.type, s)),
  ),
);

const markup = renderToStaticMarkup(
  React.createElement(
    'div',
    { style: { padding: 28, fontFamily: 'sans-serif', background: '#fff' } },
    React.createElement('h2', { style: { fontSize: 18, marginBottom: 20 } }, 'StatusRing — pie-fill across every track'),
    ...grid,
  ),
);

const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}</style></head><body><div id="root">${markup}</div></body></html>`;
writeFileSync(join(OUT, 'ring.html'), html);

async function shoot() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto('file://' + join(OUT, 'ring.html'));
  await page.waitForTimeout(300);
  const el = await page.$('#root > *');
  await (el ?? page).screenshot({ path: join(OUT, 'ring.png') });
  await browser.close();
  console.log('wrote', join(OUT, 'ring.png'));
}

shoot().catch((e) => {
  console.error(e);
  process.exit(1);
});
