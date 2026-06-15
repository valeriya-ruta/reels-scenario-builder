// Dev-only proof: the status filter — open dropdown (checkbox multiselect) +
// active filters as removable chips + "Усі" reset. Replicates StatusFilter's
// markup (its dropdown open state is internal) using the real constants.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { CONTENT_STATUSES, STATUS_COLORS, STATUS_LABELS, type ContentStatus } from '@/lib/content/statusSystem';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });
const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');
const selected: ContentStatus[] = ['script', 'design'];
const sel = new Set(selected);

const pill = (label: string, active: boolean) =>
  React.createElement('span', {
    style: {
      borderRadius: 99, padding: '6px 12px', fontSize: 14, fontWeight: 500,
      background: active ? '#141414' : '#f6f6f6', color: active ? '#fff' : '#666',
    },
  }, label);

const chip = (s: ContentStatus) =>
  React.createElement('span', {
    key: s,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 99,
      padding: '4px 10px', fontSize: 12, fontWeight: 600,
      color: STATUS_COLORS[s], background: `${STATUS_COLORS[s]}1F`,
    },
  }, STATUS_LABELS[s], React.createElement('span', null, '✕'));

const bar = React.createElement('div',
  { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
  pill('Усі', selected.length === 0),
  React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #ececec', borderRadius: 99, padding: '6px 12px', fontSize: 14, fontWeight: 500 } },
    'Фільтр', React.createElement('span', { style: { background: '#141414', color: '#fff', borderRadius: 99, padding: '0 6px', fontSize: 12 } }, String(selected.length)), '▾'),
  ...selected.map(chip),
);

const dropdown = React.createElement('div',
  { style: { width: 224, borderRadius: 16, border: '1px solid #ececec', background: '#fff', padding: 6, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', marginTop: 8 } },
  ...CONTENT_STATUSES.map((s) => {
    const checked = sel.has(s);
    return React.createElement('div', { key: s, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12 } },
      React.createElement('span', { style: { width: 16, height: 16, borderRadius: 4, border: checked ? 'none' : '1px solid #d4d4d4', background: checked ? STATUS_COLORS[s] : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11 } }, checked ? '✓' : ''),
      React.createElement('span', { style: { width: 10, height: 10, borderRadius: 99, background: STATUS_COLORS[s] } }),
      React.createElement('span', { style: { fontSize: 14 } }, STATUS_LABELS[s]));
  }),
);

const markup = renderToStaticMarkup(
  React.createElement('div', { style: { padding: 28, background: '#fff', fontFamily: "'Montserrat',sans-serif", width: 460 } },
    React.createElement('h1', { style: { fontSize: 24, fontWeight: 600, margin: '0 0 16px' } }, 'Твій контент'),
    bar,
    dropdown,
  ),
);

const face = (s: string, w: number) => `@font-face{font-family:'Montserrat';font-weight:${w};src:url('file://${join(FS, `montserrat-${s}-${w}-normal.woff2`)}') format('woff2');}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${['latin', 'cyrillic'].flatMap((s) => [face(s, 400), face(s, 500), face(s, 600)]).join('')}html,body{margin:0;padding:0}</style></head><body><div id="root">${markup}</div></body></html>`;
writeFileSync(join(OUT, 'filter.html'), html);

async function shoot() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage({ deviceScaleFactor: 2 });
  await p.goto('file://' + join(OUT, 'filter.html'));
  await p.waitForTimeout(300);
  const el = await p.$('#root > *');
  await (el ?? p).screenshot({ path: join(OUT, 'filter.png') });
  await browser.close();
  console.log('wrote', join(OUT, 'filter.png'));
}
shoot().catch((e) => { console.error(e); process.exit(1); });
