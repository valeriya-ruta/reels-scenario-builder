// Dev-only proof: the export overlay's DONE state — preview grid + the two
// footer actions (primary blue "Завантажити всі" 70% + secondary "Поділитися"
// 30%). Replicates CarouselExportOverlay's panel (BlurScrim is a client portal).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });
const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');
const tiles = [1, 2, 3, 4].map((i) => {
  const p = join(OUT, `export-${i}.png`);
  return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : '';
});

const panel = React.createElement('div',
  { className: 'relative z-[401] flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[color:var(--border)] bg-white shadow-2xl' },
  React.createElement('div', { className: 'flex items-center justify-between gap-2 border-b border-[color:var(--border)] px-5 py-4' },
    React.createElement('h2', { className: 'font-display text-lg font-semibold text-zinc-900' }, 'Готово 🎉'),
    React.createElement('button', { className: 'rounded-lg p-1 text-zinc-500' }, '×')),
  React.createElement('div', { className: 'px-5 py-4' },
    React.createElement('p', { className: 'mb-3 text-sm text-zinc-600' },
      React.createElement('b', null, '«Завантажити всі»'), ' збереже кожен слайд окремим файлом на пристрій. ',
      React.createElement('b', null, '«Поділитися»'), ' відкриє меню (Telegram, «Зберегти зображення» тощо).'),
    React.createElement('div', { className: 'grid grid-cols-3 gap-2' },
      ...tiles.filter(Boolean).map((src, i) =>
        React.createElement('div', { key: i, className: 'relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-zinc-50' },
          React.createElement('img', { src, className: 'aspect-[4/5] w-full object-cover' }))))),
  React.createElement('div', { className: 'flex flex-col gap-2 border-t border-[color:var(--border)] px-5 py-4' },
    React.createElement('div', { style: { display: 'flex', gap: 8 } },
      React.createElement('button', { style: { flex: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, background: '#004BA8', color: '#fff', padding: '12px 16px', fontSize: 14, fontWeight: 600, border: 'none' } }, '⬇  Завантажити всі (4)'),
      React.createElement('button', { style: { flex: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, background: '#fff', color: '#27272a', padding: '12px', fontSize: 14, fontWeight: 500, border: '1px solid #ececec' } }, '↗ Поділитися')),
    React.createElement('button', { className: 'inline-flex w-full items-center justify-center rounded-xl border border-[color:var(--border)] bg-white px-4 py-3 text-sm font-medium text-zinc-800' }, 'Повернутись до редагування')),
);

const markup = renderToStaticMarkup(
  React.createElement('div', { className: 'flex items-center justify-center p-6', style: { background: 'rgba(24,24,27,0.5)', width: 520 } }, panel),
);
const face = (s: string, w: number) => `@font-face{font-family:'Montserrat';font-weight:${w};src:url('file://${join(FS, `montserrat-${s}-${w}-normal.woff2`)}') format('woff2');}`;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///tmp/proof/tw.css">
<style>${['latin', 'cyrillic'].flatMap((s) => [face(s, 400), face(s, 600), face(s, 700)]).join('')}
:root{--border:#ececec;--surface:#f6f6f6}
html,body{margin:0;padding:0;font-family:'Montserrat',sans-serif}.font-display{font-family:'Montserrat',sans-serif}</style>
</head><body><div id="root">${markup}</div></body></html>`;
writeFileSync(join(OUT, 'exportoverlay.html'), html);

async function shoot() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage({ deviceScaleFactor: 2 });
  await p.goto('file://' + join(OUT, 'exportoverlay.html'));
  await p.waitForTimeout(400);
  const el = await p.$('#root > *');
  await (el ?? p).screenshot({ path: join(OUT, 'export-overlay.png') });
  await browser.close();
  console.log('wrote', join(OUT, 'export-overlay.png'));
}
shoot().catch((e) => { console.error(e); process.exit(1); });
