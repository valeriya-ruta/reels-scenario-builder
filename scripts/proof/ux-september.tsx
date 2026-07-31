// Visual proof for the September UX pass: renders the NEW surfaces with the
// real components, the real design tokens and real Tailwind, then screenshots
// them. A refinement pass is a visual claim, so "it compiles" is not acceptance.
//
//   node scripts/proof/tw-refined.mjs
//   node --import ./scripts/proof/_register.mjs ./scripts/proof/ux-september.tsx
//
// Output: _proofout_ux/*.png
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';

import ContentCard from '@/components/content/ContentCard';
import ProposalList from '@/components/propose/ProposalList';
import ProposalActions from '@/components/propose/ProposalActions';
import ReelModeSwitch from '@/components/reels/ReelModeSwitch';
import Teleprompter from '@/components/reels/Teleprompter';
import StagingPressureCard from '@/components/staging/StagingPressureCard';
import type { ContentPiece } from '@/lib/content/contentPiece';
import type { Proposal } from '@/lib/propose/types';
import type { Scene } from '@/lib/domain';

const OUT = join(process.cwd(), '_proofout_ux');
mkdirSync(OUT, { recursive: true });

const CHROME =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const now = Date.now();
const D = 24 * 3600_000;
const iso = (daysAgo: number) => new Date(now - daysAgo * D).toISOString();

const base = {
  userId: 'u1',
  createdAt: iso(10),
} as const;

const pieces: ContentPiece[] = [
  {
    ...base,
    id: '1',
    type: 'carousel',
    status: 'design',
    title: 'Втрачені клієнти',
    refTable: 'carousel_projects',
    scheduledDate: null,
    updatedAt: iso(0),
    preview: {
      lead: 'Як ми втратили 700 клієнтів',
      sub: 'Історія однієї дорогої помилки',
      count: 8,
      countLabel: '8 слайдів',
      cover: {
        background: '#232C3F',
        titleColor: '#F0EEE9',
        bodyColor: '#F0EEE9',
        hasPhoto: false,
      },
    },
  },
  {
    ...base,
    id: '2',
    type: 'reel',
    status: 'script',
    title: 'Без назви',
    refTable: 'projects',
    scheduledDate: '2026-08-02',
    updatedAt: iso(1),
    preview: {
      lead: 'Ти не втрачаєш клієнтів через ціну. Ти втрачаєш їх через тишу.',
      count: 6,
      countLabel: '6 сцен',
    },
  },
  {
    ...base,
    id: '3',
    type: 'story',
    status: 'ready',
    title: 'День 1 — визнання',
    refTable: 'storytelling_projects',
    scheduledDate: '2026-08-03',
    setIndex: 1,
    setSize: 3,
    updatedAt: iso(3),
    preview: {
      lead: 'Минулого місяця я мало не завалила проєкт, який сама ж і вигризла.',
      count: 5,
      countLabel: '5 сторіс',
    },
  },
  {
    ...base,
    id: '4',
    type: 'reel',
    status: 'idea',
    title: 'Ідея без тексту',
    refTable: 'projects',
    scheduledDate: null,
    updatedAt: iso(7),
  },
];

const proposals: Proposal[] = [
  {
    id: 'p1',
    title: 'Продовження теми: Як ми втратили 700 клієнтів',
    rationale: '«Як ми втратили 700 клієнтів» ти вже довела до публікації — тут лишилось що сказати.',
    seed: '…',
    suggestedType: 'carousel',
    source: 'proven',
  },
  {
    id: 'p2',
    title: 'Помилка, яку у твоїй ніші роблять майже всі',
    rationale: 'Твій дамп 3 дні тому так і не став контентом.',
    seed: '…',
    suggestedType: 'reels',
    source: 'unused-dump',
  },
  {
    id: 'p3',
    title: 'Дожати: Чому твій офер не працює',
    rationale: 'Лежить без дати 8 днів — або в календар, або відпускаємо.',
    seed: '…',
    suggestedType: null,
    source: 'stale',
  },
];

const scene = (order: number, lines: string, name: string | null = null): Scene =>
  ({ id: `s${order}`, project_id: 'p', order_index: order, name, lines } as unknown as Scene);

const scenes: Scene[] = [
  scene(0, 'Ти не втрачаєш клієнтів через ціну.', 'ХУК'),
  scene(1, 'Ти втрачаєш їх через тишу між листами.'),
  scene(2, 'Я порахувала: 40% відвалились там, де ми просто не відповіли вчасно.'),
  scene(3, 'Напиши в директ «ТИША» — надішлю свій чекліст.', 'CTA'),
];

/** One labelled panel in the proof sheet. */
function panel(label: string, node: React.ReactNode, width = 430) {
  return React.createElement(
    'section',
    { style: { marginBottom: 28 } },
    React.createElement(
      'p',
      {
        style: {
          margin: '0 0 8px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#8e8e98',
        },
      },
      label,
    ),
    React.createElement('div', { style: { width, maxWidth: '100%' } }, node),
  );
}

const sheet = React.createElement(
  'div',
  { style: { padding: 28, background: '#f7f7f5' } },
  panel(
    'Пропозиції — кожна з рядком міркування',
    React.createElement(ProposalList, { proposals, onPick: () => {} }),
  ),
  panel(
    'Три дієслова на кожен результат',
    React.createElement(ProposalActions, {
      rationale: 'Тут забагато для однієї сторітел — зробила сагу на 3 дні.',
      keepLabel: 'Лишаємо цей розклад',
      onKeep: () => {},
      onRegenerate: () => {},
      onTweak: () => {},
    }),
  ),
  panel(
    'Картки контенту — превʼю справжнього вигляду',
    React.createElement(
      'ul',
      { style: { listStyle: 'none', margin: 0, padding: 0 } },
      ...pieces.map((piece) =>
        React.createElement(
          'li',
          {
            key: piece.id,
            style: {
              marginBottom: 10,
              borderRadius: 16,
              border: '1px solid var(--border)',
              boxShadow: 'var(--elev-1)',
              background: 'var(--background)',
              padding: '14px',
              display: 'flex',
              gap: 12,
            },
          },
          React.createElement(ContentCard, { piece, onAdvance: () => {} }),
        ),
      ),
    ),
  ),
  panel(
    'Розбір — лічильник як тиск',
    React.createElement(StagingPressureCard, { count: 4, overdue: 2 }),
  ),
  panel('Два режими рілсу', React.createElement(ReelModeSwitch, { mode: 'teleprompter', onChange: () => {} })),
  panel('Суфлер — поверхня для читання', React.createElement(Teleprompter, { scenes })),
);

const globals = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');
// Keep only the :root token block — the rest of globals.css imports Tailwind,
// which the compiled tw.css already provides.
const rootTokens = globals.slice(globals.indexOf(':root'), globals.indexOf('@keyframes'));
const MATERIAL_CSS = ".material-symbols{font-family:'Material Symbols Outlined';font-weight:400;font-style:normal;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr;font-variation-settings:'FILL' 1;}";

// Same subset the app's layout loads, so the content-type glyphs render as
// glyphs here instead of as their ligature names.
const ICON_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:FILL@0..1&icon_names=view_carousel,movie,auto_stories,lightbulb_2&display=block';

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${ICON_FONT_HREF}">
<link rel="stylesheet" href="file://${join(OUT, 'tw.css').replace(/\\/g, '/')}">
<style>${rootTokens}${MATERIAL_CSS}
html,body{margin:0;padding:0;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif}
#root{width:486px}</style></head><body><div id="root">${renderToStaticMarkup(sheet)}</div></body></html>`;

writeFileSync(join(OUT, 'ux.html'), html);

async function shoot() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 486, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto('file://' + join(OUT, 'ux.html').replace(/\\/g, '/'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'ux-september.png'), fullPage: true });
  await browser.close();
  console.log('wrote', join(OUT, 'ux-september.png'));
}

shoot().catch((e) => {
  console.error(e);
  process.exit(1);
});
