// Dev-only proof: render the status picker list for a Story and a Carousel,
// showing all 7 statuses with invalid ones greyed + the current one checked.
// (Mirrors StatusPickerSheet's panel; BlurScrim is a client-only portal so we
// render the panel content directly for a static screenshot.)
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import {
  CONTENT_STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
  isValidStatus,
  type ContentStatus,
  type ContentType,
} from '@/lib/content/statusSystem';

const OUT = '/tmp/proof';
mkdirSync(OUT, { recursive: true });
const FS = join(process.cwd(), 'node_modules', '@fontsource', 'montserrat', 'files');

function panel(type: ContentType, current: ContentStatus, label: string) {
  return React.createElement(
    'div',
    { style: { width: 320, borderRadius: 24, background: '#fff', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', padding: 16 } },
    React.createElement('div', { style: { width: 40, height: 6, borderRadius: 99, background: '#d4d4d4', margin: '0 auto 12px' } }),
    React.createElement('p', { style: { textAlign: 'center', fontWeight: 600, fontSize: 14, margin: '0 0 4px' } }, 'Статус'),
    React.createElement('p', { style: { textAlign: 'center', fontSize: 12, color: '#888', margin: '0 0 12px' } }, label),
    ...CONTENT_STATUSES.map((status) => {
      const valid = isValidStatus(type, status);
      const isCurrent = status === current;
      return React.createElement(
        'div',
        {
          key: status,
          style: {
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px', borderRadius: 12,
            background: isCurrent ? '#f5f5f5' : 'transparent', opacity: valid ? 1 : 0.35,
          },
        },
        React.createElement('span', { style: { width: 14, height: 14, borderRadius: 99, background: STATUS_COLORS[status] } }),
        React.createElement('span', { style: { flex: 1, fontSize: 15, fontWeight: 500 } }, STATUS_LABELS[status]),
        isCurrent ? React.createElement('span', { style: { color: '#888', fontSize: 16 } }, '✓') : null,
      );
    }),
  );
}

const markup = renderToStaticMarkup(
  React.createElement(
    'div',
    { style: { display: 'flex', gap: 32, padding: 32, background: '#e8e8e8', fontFamily: "'Montserrat',sans-serif" } },
    React.createElement('div', null,
      React.createElement('p', { style: { fontWeight: 700, marginBottom: 8 } }, 'Сторіс (greys out Скрипт/Дизайн/Змонтувати/Готово)'),
      panel('story', 'film', 'Закулісся зйомки')),
    React.createElement('div', null,
      React.createElement('p', { style: { fontWeight: 700, marginBottom: 8 } }, 'Карусель (greys out Зняти/Змонтувати)'),
      panel('carousel', 'design', 'Як ми втратили 700 клієнтів')),
  ),
);

const face = (s: string, w: number) =>
  `@font-face{font-family:'Montserrat';font-weight:${w};src:url('file://${join(FS, `montserrat-${s}-${w}-normal.woff2`)}') format('woff2');}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${['latin', 'cyrillic'].flatMap((s) => [face(s, 400), face(s, 600), face(s, 700)]).join('')}html,body{margin:0;padding:0}</style></head><body><div id="root">${markup}</div></body></html>`;
writeFileSync(join(OUT, 'picker.html'), html);

async function shoot() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto('file://' + join(OUT, 'picker.html'));
  await page.waitForTimeout(300);
  const el = await page.$('#root > *');
  await (el ?? page).screenshot({ path: join(OUT, 'picker.png') });
  await browser.close();
  console.log('wrote', join(OUT, 'picker.png'));
}
shoot().catch((e) => { console.error(e); process.exit(1); });
