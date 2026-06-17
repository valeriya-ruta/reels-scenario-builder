// Dev-only proof: the redesigned carousel list — header + hairline status-ring
// rows, a row mid-swipe (red trash), an armed "Точно?" row, and the undo toast.
// Replicates SwipeableContentList's markup (it's client/stateful) with the REAL
// StatusRing.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import StatusRing from '@/components/content/StatusRing';
import { STATUS_COLORS, STATUS_LABELS, type ContentStatus } from '@/lib/content/statusSystem';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });
const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');

const ACCENT = '#5b7cfa';
function row(title: string, status: ContentStatus, date: string, opts: { shift?: number; armed?: boolean } = {}) {
  const fg = React.createElement('div', {
    style: {
      position: 'relative', display: 'flex', alignItems: 'center', gap: 12, background: '#fff',
      padding: '12px 8px', transform: `translateX(${opts.armed ? -9999 : opts.shift ?? 0}px)`,
    },
  },
    React.createElement(StatusRing, { type: 'carousel', status, size: 34, animate: false }),
    React.createElement('div', { style: { minWidth: 0, flex: 1 } },
      React.createElement('div', { style: { fontSize: 15.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, title),
      React.createElement('div', { style: { marginTop: 2, fontSize: 12.5 } },
        React.createElement('span', { style: { fontWeight: 500, color: STATUS_COLORS[status] } }, STATUS_LABELS[status]),
        React.createElement('span', { style: { color: '#a1a1aa' } }, ` · ${date}`))),
    React.createElement('span', { style: { color: '#c4c4ce', fontSize: 18 } }, '›'),
  );
  const red = React.createElement('div', {
    style: {
      position: 'absolute', inset: 0, left: 'auto', right: 0, width: opts.armed ? '100%' : 88,
      background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
  }, opts.armed ? React.createElement('span', { style: { fontSize: 16, fontWeight: 700 } }, 'Точно?') : '🗑');
  return React.createElement('li', { style: { position: 'relative', overflow: 'hidden', listStyle: 'none' } },
    red, fg,
    React.createElement('div', { style: { marginLeft: 52, marginRight: 20, height: 1, background: '#ececec' } }));
}

const markup = renderToStaticMarkup(
  React.createElement('div', { style: { width: 430, background: '#fff', padding: '24px 16px', fontFamily: "'Montserrat',sans-serif", position: 'relative', minHeight: 560 } },
    // header
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        React.createElement('span', { style: { width: 38, height: 38, borderRadius: 11, background: '#eef1ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontSize: 18 } }, '▦'),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 21, fontWeight: 700 } }, 'Каруселі'),
          React.createElement('div', { style: { fontSize: 12.5, color: '#9a9aa6' } }, '5 матеріалів'))),
      React.createElement('span', { style: { border: `1.5px solid ${ACCENT}`, color: ACCENT, borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 600 } }, '+ Створити')),
    React.createElement('div', { style: { height: 1, background: '#ececec' } }),
    React.createElement('ul', { style: { margin: 0, padding: 0 } },
      row('Як ми втратили 700 клієнтів', 'design', '17 черв.'),
      row('5 кроків до першого продажу', 'ready', '14 черв.', { shift: -88 }), // mid-swipe: trash revealed
      row('Чек-лист запуску', 'script', '9 черв.', { armed: true }),           // armed: full-width Точно?
      row('Кейс: x3 за місяць', 'published', '5 черв.'),
      row('Чернетка без назви', 'idea', '28 трав.'),
    ),
    // undo toast
    React.createElement('div', { style: { position: 'absolute', left: 16, right: 16, bottom: 16 } },
      React.createElement('div', { style: { borderRadius: 16, overflow: 'hidden', background: '#18181b', color: '#fff' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px' } },
          React.createElement('span', { style: { fontSize: 14 } }, 'Видалено «Чек-лист запуску»'),
          React.createElement('span', { style: { fontSize: 14, fontWeight: 600, color: ACCENT } }, 'Скасувати')),
        React.createElement('div', { style: { height: 3, background: 'rgba(255,255,255,0.15)' } },
          React.createElement('div', { style: { height: '100%', width: '55%', background: ACCENT } })))),
  ),
);

const face = (s: string, w: number) => `@font-face{font-family:'Montserrat';font-weight:${w};src:url('file://${join(FS, `montserrat-${s}-${w}-normal.woff2`)}') format('woff2');}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${['latin', 'cyrillic'].flatMap((s) => [face(s, 400), face(s, 600), face(s, 700)]).join('')}html,body{margin:0;padding:0}</style></head><body><div id="root">${markup}</div></body></html>`;
writeFileSync(join(OUT, 'swipelist.html'), html);

async function shoot() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage({ deviceScaleFactor: 2 });
  await p.goto('file://' + join(OUT, 'swipelist.html'));
  await p.waitForTimeout(300);
  const el = await p.$('#root > *');
  await (el ?? p).screenshot({ path: join(OUT, 'swipe-list.png') });
  await browser.close();
  console.log('wrote', join(OUT, 'swipe-list.png'));
}
shoot().catch((e) => { console.error(e); process.exit(1); });
