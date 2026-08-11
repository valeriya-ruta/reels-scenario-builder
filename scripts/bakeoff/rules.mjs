/**
 * Mechanical rule checks, one set per generation type.
 *
 * Every rule here is a literal, objectively-checkable instruction from the
 * production prompt in AI_AUDIT.md — scene word counts, slide type ordering,
 * saga CTA placement, and so on. These do NOT judge voice, taste or whether the
 * output matches Kunj's ideal; that is the human/Claude scoring pass. What they
 * do is answer "did the model actually follow the prompt", which is the half of
 * the bake-off that should never be decided by eyeballing.
 *
 * CRITICAL: these run against RAW model output, before the app's normalizers.
 * `carouselRantPostProcess` / `storiesNormalize` / `flattenToSceneDrafts` repair
 * most of these violations silently, so scoring normalized output would score
 * the normalizer, not the model. See AI_AUDIT.md § "The safety net that hides drift".
 */

const RUSSIAN_ONLY = /[ыэъё]/i;

function pass(id, label) {
  return { id, label, ok: true, detail: null };
}
function fail(id, label, detail) {
  return { id, label, ok: false, detail };
}
function check(cond, id, label, detail) {
  return cond ? pass(id, label) : fail(id, label, detail);
}

function words(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

function sentences(text) {
  return String(text ?? '')
    .split(/[.!?…]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Loose comparison key, mirroring `beatKey` in lib/ai/rantToScript.ts. */
function beatKey(text) {
  return String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').trim();
}

function collectText(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectText(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectText(v, out));
  return out;
}

/** Ukrainian output must not drift into Russian. Applies to every uk-language type. */
function noRussianCheck(parsed) {
  const offenders = collectText(parsed).filter((t) => RUSSIAN_ONLY.test(t));
  return check(
    offenders.length === 0,
    'no-russian',
    'Ніякої російської',
    offenders.length ? `${offenders.length} field(s) contain ы/э/ъ/ё, e.g. "${offenders[0].slice(0, 80)}"` : null,
  );
}

// ─────────────────────────────────────────────────────────── reel

const REEL_HOOK_CTA_LABELS = new Set([
  'хук', 'hook', 'cta', 'заклик', 'заклик до дії', 'call to action',
]);

export function checkReel(parsed) {
  const results = [];
  const hook = String(parsed?.hook ?? '').trim();
  const cta = String(parsed?.cta ?? '').trim();
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
  const texts = scenes.map((s) => String(s?.text ?? '').trim()).filter(Boolean);

  results.push(check(Boolean(String(parsed?.title ?? '').trim()), 'title', 'Є title'));
  results.push(check(Boolean(hook), 'hook-present', 'Рівно один хук у полі "hook"'));
  results.push(check(Boolean(cta), 'cta-present', 'Рівно один CTA у полі "cta"'));
  results.push(check(texts.length > 0, 'scenes-present', 'Масив scenes не порожній'));

  results.push(
    check(
      texts.length >= 8 && texts.length <= 25,
      'scene-count',
      'Сцен 8–25',
      `${texts.length} scenes`,
    ),
  );

  // The prompt's single loudest rule, stated twice: 6–11 words per scene.
  const lengths = texts.map((t) => words(t).length);
  const bad = lengths.filter((n) => n < 6 || n > 11).length;
  const compliance = lengths.length ? Math.round(((lengths.length - bad) / lengths.length) * 100) : 0;
  results.push(
    check(
      bad === 0,
      'scene-length',
      'Кожна сцена 6–11 слів',
      lengths.length
        ? `${compliance}% compliant (${bad}/${lengths.length} outside 6–11; min ${Math.min(...lengths)}, max ${Math.max(...lengths)})`
        : 'no scenes',
    ),
  );

  const labelled = scenes.filter((s) => REEL_HOOK_CTA_LABELS.has(String(s?.label ?? '').toLowerCase().trim()));
  results.push(
    check(
      labelled.length === 0,
      'no-hook-cta-labels',
      'Немає сцен із label ХУК/CTA',
      labelled.length ? `${labelled.length} scene(s) labelled as hook/CTA` : null,
    ),
  );

  const hookKey = beatKey(hook);
  const ctaKey = beatKey(cta);
  const dupes = texts.filter((t) => {
    const k = beatKey(t);
    return k && (k === hookKey || k === ctaKey);
  });
  results.push(
    check(
      dupes.length === 0,
      'no-hook-cta-dupes',
      'Хук/CTA не продубльовані в scenes',
      dupes.length ? `${dupes.length} scene(s) repeat the hook or CTA verbatim` : null,
    ),
  );

  results.push(noRussianCheck(parsed));
  return { results, metrics: { sceneCount: texts.length, sceneLengthCompliancePct: compliance } };
}

// ─────────────────────────────────────────────────────────── carousel

const SLIDE_TYPES = new Set(['cover', 'content', 'statement', 'bullets', 'cta']);
const ICONS = new Set([
  'image', 'lightning', 'star', 'check', 'arrow-right', 'clock', 'calendar',
  'fire', 'sparkle', 'target', 'camera', 'pen', 'chart', 'heart', 'globe',
]);

export function checkCarousel(parsed) {
  const results = [];
  const slides = Array.isArray(parsed?.slides) ? parsed.slides : [];
  const types = slides.map((s) => s?.type);

  results.push(
    check(slides.length >= 5 && slides.length <= 20, 'slide-count', 'Слайдів 5–20', `${slides.length} slides`),
  );
  results.push(check(types[0] === 'cover', 'first-cover', 'Перший слайд = cover', `got "${types[0]}"`));
  results.push(
    check(types[types.length - 1] === 'cta', 'last-cta', 'Останній слайд = cta', `got "${types[types.length - 1]}"`),
  );

  // ── Ruta's method (her rules), on top of the app's schema contract ──

  // Rule 2: slides 1–3 are three standalone hooks. Encoded as cover-type slides
  // (the post-processor leaves middle covers alone). This is a proxy: it detects
  // the STRUCTURE of three front hooks, not whether each actually escalates —
  // that (hype → worse → worse) is the editorial call in the report.
  const firstThree = types.slice(0, 3);
  const hookCount = firstThree.filter((t) => t === 'cover').length;
  results.push(
    check(
      slides.length >= 4 && hookCount === 3,
      'three-hooks',
      'Слайди 1–3 — три окремі хуки (type=cover)',
      `${hookCount}/3 of the first slides are cover; got [${firstThree.join(', ')}]`,
    ),
  );

  // Slide 1 carries a subline (in body): a promise / reason-to-read, and it
  // advertises a lead magnet when there is one. Ruta's rule — a bare hook
  // headline is weaker than one with a promise under it.
  results.push(
    check(
      Boolean(String(slides[0]?.body ?? '').trim()),
      'slide1-subline',
      'Слайд 1 має підзаголовок-обіцянку (body)',
      slides[0] ? 'slide 1 has no subline' : 'no slides',
    ),
  );

  // Rule 3: exactly one CTA, and it is the last slide.
  const ctaCount = types.filter((t) => t === 'cta').length;
  results.push(
    check(ctaCount === 1, 'single-cta', 'Рівно один CTA на всю карусель', `${ctaCount} cta slide(s)`),
  );

  // Marked blanks use square brackets [..], never invented specifics. We can't
  // detect fabrication, but we CAN flag the wrong placeholder syntax (*..*,
  // {..} is reserved for accents), which is a concrete, checkable drift.
  const bracketBlanks = collectText(parsed).join(' ').match(/\[[^\]]+\]/g)?.length ?? 0;
  const starBlanks = collectText(parsed).join(' ').match(/\*[^*]+\*/g)?.length ?? 0;
  results.push(
    check(
      starBlanks === 0,
      'blank-format',
      'Пустографки у [квадратних] дужках, не *зірочках*',
      starBlanks ? `${starBlanks} field(s) use *...* instead of [...]` : null,
    ),
  );

  const unknown = types.filter((t) => !SLIDE_TYPES.has(t));
  results.push(
    check(unknown.length === 0, 'valid-types', 'Усі type з дозволеного списку',
      unknown.length ? `unknown: ${[...new Set(unknown)].join(', ')}` : null),
  );

  // Ruta doesn't use `statement` slides at all ("statements are dead").
  const statementCount = types.filter((t) => t === 'statement').length;
  results.push(
    check(statementCount === 0, 'no-statements', 'Без statement-слайдів (Рута їх не використовує)', `${statementCount} statement slides`),
  );

  const badBullets = slides.filter(
    (s) => s?.type === 'bullets' && !(Array.isArray(s?.items) && s.items.length > 0),
  ).length;
  const strayItems = slides.filter(
    (s) => s?.type !== 'bullets' && Array.isArray(s?.items) && s.items.length > 0,
  ).length;
  results.push(
    check(badBullets === 0, 'bullets-have-items', 'bullets мають непорожній items', badBullets ? `${badBullets} bullets slide(s) without items` : null),
  );
  results.push(
    check(strayItems === 0, 'items-only-on-bullets', 'items лише в bullets', strayItems ? `${strayItems} non-bullets slide(s) carry items` : null),
  );

  const badIcons = slides
    .map((s) => s?.icon)
    .filter((i) => i !== null && i !== undefined && !ICONS.has(i));
  results.push(
    check(badIcons.length === 0, 'valid-icons', 'Іконки з дозволеного списку',
      badIcons.length ? `unknown: ${[...new Set(badIcons)].join(', ')}` : null),
  );

  results.push(noRussianCheck(parsed));
  return { results, metrics: { slideCount: slides.length, statementCount, hookCount, bracketBlanks } };
}

// ─────────────────────────────────────────────────────────── storytelling

const VISUALS = new Set(['Кольоровий фон', 'Говоряча голова', 'Відео в тему', 'Гарне фото']);
const INTERACTIVES = new Set(['Стікер', 'Тягнулка', 'Опитування', 'Заклик в директ']);
const OPENING_VISUALS = new Set(['Говоряча голова', 'Відео в тему']);
const CTA = 'Заклик в директ';

export function checkStorytelling(parsed) {
  const results = [];
  const mode = parsed?.mode;
  const days = Array.isArray(parsed?.days) ? parsed.days : [];
  const reason = String(parsed?.reason ?? '').trim();

  results.push(check(mode === 'single' || mode === 'saga', 'mode', 'mode = single | saga', `got "${mode}"`));
  results.push(check(Boolean(reason), 'reason-present', 'Є reason'));
  results.push(
    check(reason ? sentences(reason).length === 1 : false, 'reason-one-sentence', 'reason — одне речення',
      reason ? `${sentences(reason).length} sentence(s)` : 'missing'),
  );

  const cv = parsed?.cases_variant ?? null;
  results.push(
    check(
      mode === 'saga' ? cv === 'A' || cv === 'B' : cv === null,
      'cases-variant',
      'cases_variant відповідає mode',
      `mode=${mode}, cases_variant=${JSON.stringify(cv)}`,
    ),
  );

  results.push(
    check(
      mode === 'saga' ? days.length > 1 : days.length === 1,
      'day-count',
      'single → 1 день; saga → кілька днів',
      `${days.length} day(s) for mode=${mode}`,
    ),
  );

  const badDayLen = [];
  const badOpenVisual = [];
  const badOpenCta = [];
  const missingSticker = [];
  const badVisuals = [];
  const badInteractives = [];
  const longScreenText = [];
  const missingThought = [];

  days.forEach((day, di) => {
    const slides = Array.isArray(day?.slides) ? day.slides : [];
    if (slides.length < 5 || slides.length > 10) badDayLen.push(`day ${di + 1}: ${slides.length}`);

    const first = slides[0];
    if (first && !OPENING_VISUALS.has(first.visual)) badOpenVisual.push(`day ${di + 1}: "${first.visual}"`);
    if (first && first.interactive === CTA) badOpenCta.push(`day ${di + 1}`);

    const early = [slides[1], slides[2]].filter(Boolean);
    if (early.length > 0 && !early.some((s) => s.interactive === 'Стікер')) missingSticker.push(`day ${di + 1}`);

    slides.forEach((s, si) => {
      if (s?.visual !== undefined && !VISUALS.has(s.visual)) badVisuals.push(`d${di + 1}s${si + 1}="${s.visual}"`);
      if (s?.interactive !== null && s?.interactive !== undefined && !INTERACTIVES.has(s.interactive)) {
        badInteractives.push(`d${di + 1}s${si + 1}="${s.interactive}"`);
      }
      if (sentences(s?.screen_text).length > 2) longScreenText.push(`d${di + 1}s${si + 1}`);
      if (!String(s?.one_thought ?? '').trim()) missingThought.push(`d${di + 1}s${si + 1}`);
    });
  });

  results.push(check(badDayLen.length === 0, 'slides-per-day', '5–10 слайдів на день', badDayLen.join('; ') || null));
  results.push(
    check(badOpenVisual.length === 0, 'day-opening-visual',
      'Слайд 1 дня = Говоряча голова / Відео в тему', badOpenVisual.join('; ') || null),
  );
  results.push(
    check(badOpenCta.length === 0, 'day-opening-no-cta', 'Слайд 1 дня без "Заклик в директ"', badOpenCta.join('; ') || null),
  );
  results.push(
    check(missingSticker.length === 0, 'early-sticker', 'Стікер на слайді 2 або 3 кожного дня', missingSticker.join('; ') || null),
  );
  results.push(
    check(badVisuals.length === 0, 'valid-visuals', 'visual з дозволеного списку', badVisuals.slice(0, 5).join('; ') || null),
  );
  results.push(
    check(badInteractives.length === 0, 'valid-interactives', 'interactive з дозволеного списку', badInteractives.slice(0, 5).join('; ') || null),
  );
  results.push(
    check(longScreenText.length === 0, 'screen-text-length', 'screen_text = 1–2 короткі речення',
      longScreenText.length ? `${longScreenText.length} slide(s) over 2 sentences: ${longScreenText.slice(0, 5).join(', ')}` : null),
  );
  results.push(
    check(missingThought.length === 0, 'one-thought-present', 'Кожен слайд має one_thought', missingThought.slice(0, 5).join(', ') || null),
  );

  // CTA placement: allowed ONLY on the final slide of the final day.
  const ctaPositions = [];
  days.forEach((day, di) => {
    (Array.isArray(day?.slides) ? day.slides : []).forEach((s, si) => {
      if (s?.interactive === CTA) ctaPositions.push({ di, si });
    });
  });
  const lastDayIdx = days.length - 1;
  const lastSlideIdx = (Array.isArray(days[lastDayIdx]?.slides) ? days[lastDayIdx].slides.length : 0) - 1;
  const strayCta = ctaPositions.filter((p) => !(p.di === lastDayIdx && p.si === lastSlideIdx));
  results.push(
    check(
      ctaPositions.length === 1 && strayCta.length === 0,
      'cta-placement',
      '"Заклик в директ" лише на останньому слайді останнього дня',
      `${ctaPositions.length} CTA slide(s); ${strayCta.length} misplaced`,
    ),
  );

  // Honest placeholders: *...* notes rather than invented specifics.
  const placeholderCount = collectText(parsed).join(' ').match(/\*[^*]+\*/g)?.length ?? 0;
  results.push(
    check(placeholderCount > 0, 'placeholders', 'Є чесні *плейсхолдери*', `${placeholderCount} found`),
  );

  results.push(noRussianCheck(parsed));
  return { results, metrics: { dayCount: days.length, placeholderCount } };
}

// ─────────────────────────────────────────────────────────── ideas

const PROPOSAL_TYPES = new Set(['reels', 'carousel', 'stories']);

export function checkIdeas(parsed, { expectedCount = 3 } = {}) {
  const results = [];
  const list = Array.isArray(parsed?.proposals) ? parsed.proposals : [];

  results.push(
    check(list.length === expectedCount, 'proposal-count', `Рівно ${expectedCount} пропозиції`, `${list.length} returned`),
  );

  const missingTitle = list.filter((p) => !String(p?.title ?? '').trim()).length;
  const missingRationale = list.filter((p) => !String(p?.rationale ?? '').trim()).length;
  const missingSeed = list.filter((p) => !String(p?.seed ?? '').trim()).length;

  results.push(check(missingTitle === 0, 'title-present', 'Кожна має title', missingTitle ? `${missingTitle} missing` : null));
  results.push(
    check(missingRationale === 0, 'rationale-present', 'Кожна має rationale (без нього — просто кнопка)',
      missingRationale ? `${missingRationale} missing` : null),
  );
  results.push(check(missingSeed === 0, 'seed-present', 'Кожна має seed', missingSeed ? `${missingSeed} missing` : null));

  const tooLong = list.filter((p) => String(p?.title ?? '').trim().length > 60);
  results.push(
    check(tooLong.length === 0, 'title-length', 'title ≤ 60 символів',
      tooLong.length ? tooLong.map((p) => `${String(p.title).length} chars`).join(', ') : null),
  );

  const questions = list.filter((p) => String(p?.title ?? '').trim().endsWith('?'));
  results.push(
    check(questions.length === 0, 'title-not-question', 'title — твердження, не питання до авторки',
      questions.length ? questions.map((p) => `"${p.title}"`).join('; ') : null),
  );

  const longSeeds = list.filter((p) => sentences(p?.seed).length > 2);
  results.push(
    check(longSeeds.length === 0, 'seed-length', 'seed = 1–2 речення', longSeeds.length ? `${longSeeds.length} over 2 sentences` : null),
  );

  const badTypes = list.map((p) => p?.type).filter((t) => t !== null && t !== undefined && !PROPOSAL_TYPES.has(t));
  results.push(
    check(badTypes.length === 0, 'valid-type', 'type = reels | carousel | stories | null',
      badTypes.length ? `unknown: ${[...new Set(badTypes)].join(', ')}` : null),
  );

  const titles = list.map((p) => beatKey(p?.title)).filter(Boolean);
  results.push(
    check(new Set(titles).size === titles.length, 'distinct-angles', 'Кути різні, не варіації одного',
      new Set(titles).size !== titles.length ? 'duplicate titles' : null),
  );

  results.push(noRussianCheck(parsed));
  return { results, metrics: { proposalCount: list.length } };
}

export function score(results) {
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  return { passed, total, pct: total ? Math.round((passed / total) * 100) : 0 };
}
