/**
 * Self-test for the bake-off scorer. No API key, no network.
 *
 * Each case asserts that a specific rule fires exactly when it should: a
 * compliant fixture must pass every rule, and each violating fixture must fail
 * the one rule it violates. Without this, a silently-broken check would quietly
 * report every model as compliant and the bake-off would pick a winner on noise.
 *
 *   node --import ./scripts/proof/_register.mjs scripts/bakeoff/verify.mjs
 */

import { checkCarousel, checkIdeas, checkReel, checkStorytelling, score } from './rules.mjs';
import { extractJson } from './openrouter.mjs';
import { GENERATION_TYPES, TYPE_IDS } from './registry.mjs';
import { renderReport } from './report.mjs';

let failures = 0;

function assert(cond, message) {
  if (cond) {
    console.log(`  ok   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures += 1;
  }
}

function ruleOk(checked, id) {
  const hit = checked.results.find((r) => r.id === id);
  if (!hit) throw new Error(`no such rule: ${id}`);
  return hit.ok;
}

function expectClean(checked, label) {
  const s = score(checked.results);
  const broken = checked.results.filter((r) => !r.ok).map((r) => `${r.id}${r.detail ? ` (${r.detail})` : ''}`);
  assert(s.pct === 100, `${label} — all rules pass${broken.length ? ` [broke: ${broken.join(', ')}]` : ''}`);
}

function expectBreaks(checked, id, label) {
  assert(!ruleOk(checked, id), `${label} — rule "${id}" fires`);
}

// ───────────────────────────────────────────── reel

console.log('\nreel');
const goodScene = (t) => ({ id: 1, label: 'Проблема', text: t });
const NINE = 'Ти сидиш і дивишся на порожній екран вже'; // 8 words
const reelGood = {
  title: 'Тест',
  hook: 'Ось незручна правда про контент',
  cta: 'Збережи це собі на потім',
  scenes: Array.from({ length: 10 }, () => goodScene(NINE)),
};
expectClean(checkReel(reelGood), 'compliant reel');

expectBreaks(checkReel({ ...reelGood, hook: '' }), 'hook-present', 'missing hook');
expectBreaks(checkReel({ ...reelGood, cta: '' }), 'cta-present', 'missing CTA');
expectBreaks(checkReel({ ...reelGood, scenes: reelGood.scenes.slice(0, 3) }), 'scene-count', '3 scenes');
expectBreaks(
  checkReel({ ...reelGood, scenes: [...reelGood.scenes, goodScene('Це речення навмисно значно довше за одинадцять слів щоб порушити жорстке правило довжини сцени')] }),
  'scene-length',
  'over-long scene',
);
expectBreaks(
  checkReel({ ...reelGood, scenes: [...reelGood.scenes, { label: 'ХУК', text: NINE }] }),
  'no-hook-cta-labels',
  'scene labelled ХУК',
);
expectBreaks(
  checkReel({ ...reelGood, scenes: [...reelGood.scenes, goodScene(reelGood.cta)] }),
  'no-hook-cta-dupes',
  'CTA duplicated into scenes',
);
expectBreaks(
  checkReel({ ...reelGood, hook: 'Вот эта правда про контент ёлки' }),
  'no-russian',
  'Russian characters',
);

// ───────────────────────────────────────────── carousel

console.log('\ncarousel');
const slide = (type, extra = {}) => ({ type, title: 'Т', body: null, label: null, items: null, icon: null, accent_spans: [], ...extra });
const carouselGood = {
  total_slides: 6,
  slides: [
    slide('cover', { body: 'і як я це пережила — + промпт' }), // hook 1 + subline
    slide('cover'), // hook 2
    slide('cover'), // hook 3
    slide('content', { icon: 'image', body: 'Тіло. Одна думка.' }),
    slide('bullets', { items: ['а', 'б'] }),
    slide('cta', { body: 'Напиши [слово] в директ' }),
  ],
};
expectClean(checkCarousel(carouselGood), 'compliant carousel (Ruta method)');

expectBreaks(checkCarousel({ slides: carouselGood.slides.slice(0, 3) }), 'slide-count', '3 slides');
expectBreaks(
  checkCarousel({ slides: [slide('content'), ...carouselGood.slides.slice(1)] }),
  'first-cover',
  'first slide not cover',
);
expectBreaks(
  checkCarousel({ slides: [...carouselGood.slides.slice(0, 5), slide('content')] }),
  'last-cta',
  'last slide not cta',
);
expectBreaks(
  checkCarousel({ slides: [slide('cover'), slide('cover'), slide('cover'), slide('statement'), slide('content'), slide('cta')] }),
  'no-statements',
  'uses a statement slide',
);
expectBreaks(
  checkCarousel({ slides: [slide('cover'), slide('bullets'), slide('content'), slide('content'), slide('content'), slide('cta')] }),
  'bullets-have-items',
  'bullets without items',
);
expectBreaks(
  checkCarousel({ slides: [slide('cover'), slide('content', { icon: 'banana' }), slide('content'), slide('content'), slide('content'), slide('cta')] }),
  'valid-icons',
  'unknown icon',
);
// Ruta's method
expectBreaks(
  checkCarousel({ slides: [slide('cover'), slide('content'), slide('content'), slide('content'), slide('bullets', { items: ['а'] }), slide('cta')] }),
  'three-hooks',
  'only one hook up front',
);
expectBreaks(
  checkCarousel({ slides: [slide('cover'), slide('cover'), slide('cover'), slide('content'), slide('bullets', { items: ['а'] }), slide('cta')] }),
  'slide1-subline',
  'slide 1 has no promise subline',
);
expectBreaks(
  checkCarousel({ slides: [slide('cover'), slide('cover'), slide('cover'), slide('cta'), slide('content'), slide('cta')] }),
  'single-cta',
  'two CTA slides',
);
expectBreaks(
  checkCarousel({ slides: [slide('cover'), slide('cover'), slide('cover'), slide('content', { body: 'заробив *твоя цифра* грн' }), slide('bullets', { items: ['а'] }), slide('cta')] }),
  'blank-format',
  'placeholder uses *...* instead of [...]',
);

// ───────────────────────────────────────────── storytelling

console.log('\nstorytelling');
const stSlide = (n, visual, interactive) => ({
  slide_number: n,
  one_thought: 'думка',
  screen_text: n === 3 ? 'Текст із *плейсхолдером* тут.' : 'Короткий текст.',
  visual,
  interactive,
});
const day = (n, withCta) => ({
  day_number: n,
  title: `День ${n}`,
  goal: 'бар\'єр',
  slides: [
    stSlide(1, 'Говоряча голова', null),
    stSlide(2, 'Кольоровий фон', 'Стікер'),
    stSlide(3, 'Гарне фото', null),
    stSlide(4, 'Відео в тему', 'Опитування'),
    stSlide(5, 'Кольоровий фон', withCta ? 'Заклик в директ' : null),
  ],
});
const storyGood = {
  mode: 'saga',
  reason: 'Тут забагато для однієї історії тому зробила сагу',
  cases_variant: 'A',
  template_used: 'A',
  template_name: 'Тест',
  days: [day(1, false), day(2, false), day(3, false), day(4, true)],
};
expectClean(checkStorytelling(storyGood), 'compliant saga');

const singleGood = {
  ...storyGood,
  mode: 'single',
  cases_variant: null,
  reason: 'Одна думка одна історія',
  days: [day(1, true)],
};
expectClean(checkStorytelling(singleGood), 'compliant single');

expectBreaks(checkStorytelling({ ...storyGood, cases_variant: null }), 'cases-variant', 'saga without cases_variant');
expectBreaks(checkStorytelling({ ...storyGood, days: [day(1, true)] }), 'day-count', 'saga with one day');
expectBreaks(
  checkStorytelling({ ...storyGood, days: [{ ...day(1, false), slides: day(1, false).slides.slice(0, 3) }, day(2, false), day(3, false), day(4, true)] }),
  'slides-per-day',
  '3 slides in a day',
);
expectBreaks(
  checkStorytelling({
    ...storyGood,
    days: [{ ...day(1, false), slides: [stSlide(1, 'Гарне фото', null), ...day(1, false).slides.slice(1)] }, day(2, false), day(3, false), day(4, true)],
  }),
  'day-opening-visual',
  'day opens on Гарне фото',
);
expectBreaks(
  checkStorytelling({
    ...storyGood,
    days: [{ ...day(1, false), slides: day(1, false).slides.map((s) => (s.interactive === 'Стікер' ? { ...s, interactive: null } : s)) }, day(2, false), day(3, false), day(4, true)],
  }),
  'early-sticker',
  'no sticker on slides 2–3',
);
expectBreaks(checkStorytelling({ ...storyGood, days: [day(1, true), day(2, false), day(3, false), day(4, true)] }), 'cta-placement', 'CTA on a non-final day');
expectBreaks(checkStorytelling({ ...storyGood, days: [day(1, false), day(2, false), day(3, false), day(4, false)] }), 'cta-placement', 'no CTA at all');
expectBreaks(
  checkStorytelling({ ...storyGood, reason: 'Перше речення. Друге речення.' }),
  'reason-one-sentence',
  'two-sentence reason',
);
expectBreaks(
  checkStorytelling({
    ...storyGood,
    days: storyGood.days.map((d) => ({ ...d, slides: d.slides.map((s) => ({ ...s, screen_text: 'Одне. Друге. Третє.' })) })),
  }),
  'placeholders',
  'no placeholders anywhere',
);

// ───────────────────────────────────────────── ideas

console.log('\nideas');
const ideasGood = {
  proposals: [
    { title: 'Помилка, яку роблять усі', rationale: 'Твій дамп 3 дні тому так і не став контентом', seed: 'Розкажи про помилку.', type: 'reels' },
    { title: 'Чому дешевий фарбник дорожчий', rationale: 'Це вже спрацювало минулого тижня', seed: 'Порівняй вартість.', type: 'carousel' },
    { title: 'Що я зрозуміла за десять років', rationale: 'Лежить без дати вже 12 днів', seed: 'Особистий підсумок.', type: 'stories' },
  ],
};
expectClean(checkIdeas(ideasGood), 'compliant ideas');

expectBreaks(checkIdeas({ proposals: ideasGood.proposals.slice(0, 2) }), 'proposal-count', '2 proposals');
expectBreaks(
  checkIdeas({ proposals: ideasGood.proposals.map((p, i) => (i === 0 ? { ...p, rationale: '' } : p)) }),
  'rationale-present',
  'missing rationale',
);
expectBreaks(
  checkIdeas({ proposals: ideasGood.proposals.map((p, i) => (i === 0 ? { ...p, title: 'Про що розповісти сьогодні?' } : p)) }),
  'title-not-question',
  'title is a question',
);
expectBreaks(
  checkIdeas({ proposals: ideasGood.proposals.map((p, i) => (i === 0 ? { ...p, title: 'Д'.repeat(61) } : p)) }),
  'title-length',
  'title over 60 chars',
);
expectBreaks(
  checkIdeas({ proposals: [ideasGood.proposals[0], ideasGood.proposals[0], ideasGood.proposals[2]] }),
  'distinct-angles',
  'duplicate titles',
);
expectBreaks(
  checkIdeas({ proposals: ideasGood.proposals.map((p, i) => (i === 0 ? { ...p, type: 'tiktok' } : p)) }),
  'valid-type',
  'unknown type',
);

// ───────────────────────────────────────────── JSON extraction

console.log('\njson extraction');
assert(extractJson('{"a":1}').parsed?.a === 1, 'bare JSON parses');
const fenced = extractJson('```json\n{"a":1}\n```');
assert(fenced.parsed?.a === 1 && fenced.fenced === true, 'fenced JSON parses and is flagged');
assert(extractJson('Ось результат: {"a":1} готово').parsed?.a === 1, 'JSON embedded in prose is recovered');
assert(extractJson('not json at all').parsed === null, 'garbage returns null');
assert(extractJson('').error === 'empty response', 'empty response reported');

// ───────────────────────────────────────────── registry wiring

console.log('\nregistry');
const smokeSet = {
  id: 'smoke',
  braindump: 'Я вже десять років працюю колористкою і найбільша помилка яку я бачу це коли дівчата економлять на фарбі а потім платять втричі більше за відновлення волосся. Це болить бо я бачу це щотижня і кожного разу думаю що могла б попередити.',
  storytellingName: 'експертність',
  ideasSignals: [{ kind: 'proven', label: 'Рілс про помилки', ageDays: 3, type: 'reels' }],
};
for (const typeId of TYPE_IDS) {
  const spec = GENERATION_TYPES[typeId];
  const messages = spec.buildMessages(smokeSet);
  const systemLen = messages.find((m) => m.role === 'system')?.content?.length ?? 0;
  assert(messages.length === 2 && systemLen > 200, `${typeId} builds a system+user pair (system ${systemLen} chars)`);
  assert(typeof spec.temperature === 'number', `${typeId} declares a temperature (${spec.temperature})`);
}

// The storytelling system prompt must actually be the production one.
const stSystem = GENERATION_TYPES.storytelling.buildMessages(smokeSet)[0].content;
assert(stSystem.includes('Заклик в директ'), 'storytelling prompt is the production text');
const reelSystem = GENERATION_TYPES.reel.buildMessages(smokeSet)[0].content;
assert(reelSystem.includes('6–11 слів'), 'reel prompt is the production text');
const rutaSystem = GENERATION_TYPES['carousel-ruta'].buildMessages(smokeSet)[0].content;
assert(rutaSystem.includes('ТРИ ХУКИ') && rutaSystem.includes('[твоя цифра]'), 'carousel-ruta prompt encodes the 3-hook + marked-blank rules');
assert(!GENERATION_TYPES.carousel.buildMessages(smokeSet)[0].content.includes('ТРИ ХУКИ'), 'production carousel prompt does NOT have the 3-hook rule (baseline)');

// ───────────────────────────────────────────── report rendering

console.log('\nreport');
const fakeRecord = (model, typeId, checked, extra = {}) => ({
  set: 'smoke',
  typeId,
  model,
  attempt: 1,
  ok: true,
  parseError: null,
  fenced: false,
  jsonModeRejected: false,
  finishReason: 'stop',
  latencyMs: 1200,
  usage: { total_tokens: 900 },
  cost: 0.0012,
  scored: score(checked.results),
  metrics: checked.metrics,
  results: checked.results,
  ...extra,
});

const reportMd = renderReport(
  {
    runId: 'run-test',
    models: ['model/good', 'model/bad'],
    types: ['reel', 'carousel'],
    sets: ['smoke'],
    runs: 1,
    records: [
      fakeRecord('model/good', 'reel', checkReel(reelGood)),
      fakeRecord('model/bad', 'reel', checkReel({ ...reelGood, cta: '' }), { fenced: true }),
      fakeRecord('model/good', 'carousel', checkCarousel(carouselGood)),
      fakeRecord('model/bad', 'carousel', checkCarousel({ slides: carouselGood.slides.slice(0, 3) })),
      { set: 'smoke', typeId: 'reel', model: 'model/bad', attempt: 1, ok: false, error: 'HTTP 429: rate limited', latencyMs: 80 },
    ],
  },
  [{ id: 'smoke', label: 'Smoke', braindump: 'текст', rules: ['правило'], ideal: { reel: 'ідеал' } }],
  GENERATION_TYPES,
  '/tmp/out',
);

assert(reportMd.includes('## 1. Rule compliance'), 'report has the compliance table');
assert(reportMd.includes('## 3. Drift'), 'report has the drift section');
assert(reportMd.includes('cta-present') || reportMd.includes('Рівно один CTA'), 'drift table names the broken rule');
assert(reportMd.includes('wrapped JSON in markdown fences'), 'operational flags surface fencing');
assert(reportMd.includes('HTTP 429'), 'failed calls are listed');
assert(reportMd.includes('## 6. Scoring against the ideal results'), 'report has the human scoring pass');
assert(reportMd.includes('ідеал') && reportMd.includes('правило'), 'ideal result and rules are inlined for scoring');

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} assertion(s)`}`);
process.exit(failures === 0 ? 0 : 1);
