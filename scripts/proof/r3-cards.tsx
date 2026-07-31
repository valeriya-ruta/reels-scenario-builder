// Round 3 §1–§3: content + staging cards, rendered with the REAL components.
// Acceptance is "verify against a screenshot", so this is that screenshot.
//
//   PROOF_DIR=_proofout_r3 node scripts/proof/tw-refined.mjs
//   node --import ./scripts/proof/_register.mjs ./scripts/proof/r3-cards.tsx
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';

import ContentCard from '@/components/content/ContentCard';
import type { ContentPiece } from '@/lib/content/contentPiece';

const OUT = join(process.cwd(), '_proofout_r3');
mkdirSync(OUT, { recursive: true });
const CHROME =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const base = { userId: 'u', createdAt: '2026-07-20T10:00:00.000Z' } as const;

const pieces: ContentPiece[] = [
  // The duplicate-title case: name is DERIVED from the cover title.
  {
    ...base,
    id: '1',
    type: 'carousel',
    status: 'design',
    title: 'Як ми втратили 700 клієнтів',
    refTable: 'carousel_projects',
    scheduledDate: '2026-07-31',
    updatedAt: '2026-07-30T10:00:00.000Z',
    preview: {
      lead: 'Як ми втратили 700 клієнтів',
      sub: 'Історія однієї дорогої помилки',
      count: 8,
      countLabel: '8 слайдів',
      cover: { background: '#232C3F', titleColor: '#F0EEE9', bodyColor: '#F0EEE9', hasPhoto: false },
    },
  },
  // The banned string, straight out of the database.
  {
    ...base,
    id: '2',
    type: 'carousel',
    status: 'idea',
    title: 'Без назви',
    refTable: 'carousel_projects',
    scheduledDate: null,
    updatedAt: '2026-07-29T10:00:00.000Z',
  },
  // A reel: length, not scene count; genuinely different preview line kept.
  {
    ...base,
    id: '3',
    type: 'reel',
    status: 'script',
    title: 'Чому твій офер не працює',
    refTable: 'projects',
    scheduledDate: null,
    updatedAt: '2026-07-28T10:00:00.000Z',
    preview: {
      lead: 'Ти не втрачаєш клієнтів через ціну. Ти втрачаєш їх через тишу.',
      count: 9,
      countLabel: '9 сцен',
      durationLabel: '1:35',
    },
  },
  // A long title next to a date pill — the wrap case from §2.
  {
    ...base,
    id: '4',
    type: 'story',
    status: 'ready',
    title: 'День 1 — визнання, що все пішло не за планом',
    refTable: 'storytelling_projects',
    scheduledDate: '2026-07-31',
    setIndex: 1,
    setSize: 3,
    updatedAt: '2026-07-27T10:00:00.000Z',
    preview: { lead: 'Минулого місяця я мало не завалила проєкт.', count: 5, countLabel: '5 сторіс' },
  },
];

function CardRow({ piece, hideTypeTag }: { piece: ContentPiece; hideTypeTag?: boolean }) {
  return React.createElement(
    'li',
    {
      className: 'mb-2.5 rounded-[16px] border border-[color:var(--border)] bg-white p-3.5',
      style: { boxShadow: 'var(--elev-1)' },
    },
    React.createElement(ContentCard, { piece, onAdvance: () => {}, hideTypeTag }),
  );
}

function panel(label: string, node: React.ReactNode) {
  return React.createElement(
    'section',
    { style: { marginBottom: 26 } },
    React.createElement(
      'p',
      {
        style: {
          margin: '0 0 8px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: '#8e8e98',
        },
      },
      label,
    ),
    node,
  );
}

const sheet = React.createElement(
  'div',
  { style: { padding: 20, background: '#f7f7f5', width: 390 } },
  panel(
    'Змішаний список — тип показано',
    React.createElement(
      'ul',
      { style: { listStyle: 'none', margin: 0, padding: 0 } },
      ...pieces.map((p) => React.createElement(CardRow, { key: `m${p.id}`, piece: p })),
    ),
  ),
  panel(
    'Список каруселей — без тегу типу (§2)',
    React.createElement(
      'ul',
      { style: { listStyle: 'none', margin: 0, padding: 0 } },
      ...pieces
        .filter((p) => p.type === 'carousel')
        .map((p) => React.createElement(CardRow, { key: `c${p.id}`, piece: p, hideTypeTag: true })),
    ),
  ),
);

const globals = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');
const rootTokens = globals.slice(globals.indexOf(':root'), globals.indexOf('@keyframes'));
const MATERIAL = ".material-symbols{font-family:'Material Symbols Outlined';font-weight:400;line-height:1;display:inline-block;font-variation-settings:'FILL' 1;}";
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${join(OUT, 'tw.css').replace(/\\/g, '/')}">
<style>${rootTokens}${MATERIAL}
html,body{margin:0;padding:0;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif}
#root{width:390px}</style></head><body><div id="root">${renderToStaticMarkup(sheet)}</div></body></html>`;
writeFileSync(join(OUT, 'cards.html'), html);

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
await page.goto('file://' + join(OUT, 'cards.html').replace(/\\/g, '/'));
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'cards.png'), fullPage: true });
await browser.close();
console.log('wrote', join(OUT, 'cards.png'));
