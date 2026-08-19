import 'server-only';

import { chatEndpoint } from '@/lib/ai/aiProvider';
import { detectOutputLanguage } from '@/lib/ai/rantToScript';

/**
 * What the note's buttons actually do to the text.
 *
 * One idea runs through all of them: this is HER text, being edited, not a
 * chat producing a new document. So every operation takes text and returns
 * text — never a summary, never a preamble, never «Ось твій оновлений
 * сценарій:». The result is dropped straight back into the note where the old
 * words were, so anything the model adds around it lands in her script and
 * gets read aloud on camera.
 *
 * The parsing and paragraph-splitting are pure and live at the bottom, so the
 * rules that protect the script can be tested without a model.
 */

export type RewriteMode = 'reel' | 'shorter' | 'longer';

const LANGUAGE_RULE: Record<'uk' | 'en', string> = {
  uk: 'МОВА ВІДПОВІДІ: українська. НІКОЛИ не російська, не англійська.',
  en: 'LANGUAGE: English.',
};

/**
 * The house voice, in Ukrainian and in detail — modelled on the carousel
 * prompt, which is the one in this codebase she says holds her tone.
 *
 * English bullet-points produced polite Ukrainian filler; this does not. The
 * rules here are each a thing that actually went wrong in a real take.
 */
const VOICE_RULES = [
  'Ти — ГОЛОС САМОЇ АВТОРКИ. Не копірайтер, не коуч, не агенція.',
  '',
  'Це voice-to-text: вона наговорила думку вголос, і твоя робота — зробити з цього',
  'текст, який вона СКАЖЕ В КАМЕРУ. Не пост, не статтю, не переказ.',
  '',
  '- Тягни її ЖИВІ слова й вирази прямо з тексту. Її формулювання завжди краще',
  '  за гарніше, яке ти міг би написати.',
  '- НЕ причісуй у гладкий рекламний копірайт. Ніякого пафосу, ніяких фальшивих',
  '  осяянь («і тут я зрозуміла», «і ось у чому секрет»), ніякого «ти мусиш».',
  '- НЕ ВИГАДУЙ. Жодного факту, прикладу, цифри, міста чи думки, яких вона не',
  '  казала. Вигадане = брехня в тексті, який вона прочитає вголос.',
  '- Без емодзі, хештегів, розмітки, заголовків, ремарок і підписів на кшталт',
  '  «Хук:» чи «Сцена 1». Тільки живі розмовні речення.',
  '- Ніколи не звертайся до авторки й не пояснюй, що ти зробив.',
].join('\n');

const INSTRUCTION: Record<RewriteMode, string> = {
  reel: [
    'ЗАВДАННЯ: зробити з цього наговореного дампу сценарій рілсу.',
    '',
    '═══ ДОВЖИНА — ЦЕ ГОЛОВНЕ ═══',
    'Ціль: 60–90 секунд. Це приблизно 150–230 слів. Максимум — 2 хвилини, і то',
    'лише якщо без цього втрачається суть.',
    '',
    'Вона наговорює довго і з відступами — це нормально, так думають вголос. Твоя',
    'робота НЕ переказати все, а витягти сценарій. Ріж:',
    '- довгі пояснення «як це працює» до одного речення,',
    '- перелічування, де три приклади роблять ту саму роботу, що й один,',
    '- усе, що вона повторила вдруге іншими словами,',
    '- усе, що не працює на головну думку рілсу.',
    'Якщо після різання лишилось більше 230 слів — ріж ще.',
    '',
    '═══ ПОРЯДОК У ЗАПИСІ ≠ ПОРЯДОК У СЦЕНАРІЇ ═══',
    'ЦЕ НАЙВАЖЛИВІШЕ ПІСЛЯ ДОВЖИНИ.',
    '',
    'Те, що вона сказала щось у кінці, НЕ означає, що воно має бути в кінці.',
    'Наговорений дамп — це сирий матеріал у тому порядку, в якому воно згадалось,',
    'а не структура. Структуру будуєш ти.',
    '',
    'Спочатку розбери дамп на теми: про що вона говорила, скільки б разів не',
    'поверталась. Потім збери КОЖНУ тему в одному місці й постав теми в порядку,',
    'який має сенс для глядача.',
    '',
    'Приклад того, що зламалось насправді: вона говорила про те, ЗВІДКИ брати ідеї,',
    'потім про те, ЯК планувати фічі, а наприкінці знову повернулась до ідей — і в',
    'сценарії цей хвіст так і лишився наприкінці, після фіч. Правильно було злити',
    'його з першою частиною, бо це та сама тема, і закінчити текст фічами або',
    'висновком. Порядок запису — не аргумент.',
    '',
    'Так само з дрібнішим: вона починає думку, стрибає на приклад і повертається',
    '(«…і потім треба тестувати. А, до речі, ось мої додатки — Ran$om зʼявився тому',
    'що… — так от, тестувати треба на кожному етапі»). Приклад іде туди, де він',
    'доречний, а перервана думка договорюється ОДИН раз і до кінця.',
    '',
    'У готовому тексті не має лишитись: повторних заходів на ту саму тему,',
    'обірваних хвостів, повернень «так от, про що я», і взагалі жодного сліду того,',
    'що вона збилась. Якщо по сценарію видно порядок наговорювання — ти не',
    'переписав, ти підчистив. Це не те саме.',
    '',
    '═══ ЩО МАЄ ЛИШИТИСЬ ═══',
    '- ПЕРШИЙ рядок — гачок: одне коротке речення, від якого не гортають далі.',
    '  Будуй його ТІЛЬКИ з того, що вона реально сказала. Якщо її власна перша',
    '  фраза вже гачок — лиши її.',
    '- Головна думка і аргументи, чому вона так вважає.',
    '- Її конкретика: назви, імена, цифри, справжні приклади з життя. Це те, що',
    '  робить рілс її, а не чиїмось. Приклади можна СКОРОТИТИ, але не знеособити',
    '  («мій додаток Foral, бо в чоловіка алергії» — лишається; три абзаци про те,',
    '  як саме він працює — ні).',
    '- Одна фраза наприкінці, що закриває думку. Заклик до дії — тільки якщо вона',
    '  сама його сказала.',
    '',
    'Один абзац — одна думка, між абзацами порожній рядок.',
  ].join('\n'),

  shorter: [
    'ЗАВДАННЯ: переписати цей текст КОРОТШЕ.',
    '',
    'Переписати — не обрізати. Не можна просто видалити другу половину або',
    'відрізати кінець: так уже ставалось, і це не «коротше», це «недописане».',
    '',
    'Ціль — приблизно на третину менше слів, але ВСІ думки лишаються на місці.',
    'Скорочуй так: довге речення → коротке; три приклади → один найсильніший;',
    'пояснення на абзац → одна фраза; «те, що я хочу сказати, це…» → одразу суть.',
    '',
    'Кінець має лишитись кінцем. Текст має читатись як цілий, а не як уривок.',
  ].join('\n'),

  longer: [
    'ЗАВДАННЯ: розгорнути цей текст, використовуючи ТІЛЬКИ те, що в ньому вже є.',
    '',
    'Не можна додати жодного факту, прикладу, цифри, місця чи думки, яких у',
    'тексті нема. Так уже ставалось: на прохання розгорнути три рядки про',
    'додатки з власних болей модель видала пораду «побач проблему у своєму місті',
    'й зроби те, що потрібно ринку» — вона такого не казала. Це не розгортання,',
    'це інша людина.',
    '',
    'Розгорнути тут означає: договорити думку, яку вона обірвала; розписати крок,',
    'який вона стиснула в пів слова; дати окреме речення тому, що отримало',
    'підрядне. Якщо розгортати нічого — поверни текст майже без змін.',
  ].join('\n'),
};

/**
 * One completion, through whichever vendor this deployment is configured for.
 *
 * `chatEndpoint` prefers OpenRouter when its key is present and falls back to
 * Groq — both speak the OpenAI shape, so this call is identical either way.
 */
async function complete(system: string, user: string): Promise<string> {
  const endpoint = chatEndpoint();
  const res = await fetch(endpoint.url, {
    method: 'POST',
    headers: endpoint.headers,
    body: JSON.stringify({
      model: endpoint.model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${endpoint.vendor} ${res.status}: ${body.slice(0, 300)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = (payload.choices?.[0]?.message?.content ?? '').trim();
  if (!content) throw new Error('Модель нічого не повернула. Спробуй ще раз.');
  return content;
}

/** Rewrite the whole note, or just the phrase she selected. */
export async function rewriteReelText(
  text: string,
  mode: RewriteMode,
): Promise<{ text: string; title: string | null }> {
  const lang = detectOutputLanguage(text);
  const system = [VOICE_RULES, LANGUAGE_RULE[lang], INSTRUCTION[mode]].join('\n\n');
  const wantsTitle = mode === 'reel';

  // Plain text, not JSON. Wrapping a script in a JSON field bought nothing and
  // added a failure mode of its own: one reply the model did not quote properly
  // and the whole button answered «повернула щось незрозуміле» over text that
  // was actually fine. The reply IS the script now.
  const user = ['Поверни ТІЛЬКИ текст. Без вступу, без лапок, без пояснень.', '', 'ТЕКСТ:', text].join('\n');

  const script = normalizeScript(await complete(system, user));
  if (!script) throw new Error('Модель повернула порожній текст. Спробуй ще раз.');

  return { text: script, title: wantsTitle ? titleFrom(script) : null };
}

/**
 * A name for the reel, taken from its own opening line.
 *
 * Asked for as a second field it was one more thing a reply could get wrong,
 * and a reel whose rewrite failed because the NAME was malformed is an absurd
 * way to lose work. The hook already says what the reel is about.
 */
export function titleFrom(script: string): string | null {
  const first = script.split('\n').map((l) => l.trim()).find(Boolean);
  if (!first) return null;
  const words = first.replace(/[«»"'.,!?—–-]+$/g, '').split(/\s+/).slice(0, 5).join(' ');
  return words.slice(0, 80) || null;
}

/**
 * The caption under the post — a different job from the script.
 *
 * What she says on camera and what is written under the video are not the same
 * text: the caption is read silently, by someone who may not have sound on, and
 * repeating the script there wastes the one place a reel can carry a link or a
 * question.
 */
export async function generateCaption(script: string): Promise<string> {
  const lang = detectOutputLanguage(script);
  const system = [
    'You write the caption that sits UNDER an Instagram reel.',
    'It is read silently, often by someone who has not watched with sound.',
    'Two or three short lines. Do not retell the script — add the thought that makes someone comment.',
    'End with one simple question.',
    'No hashtags, no emoji, no markdown.',
    LANGUAGE_RULE[lang],
  ].join('\n');

  const caption = (
    await complete(system, `Return ONLY the caption text.\n\nSCRIPT:\n${script}`)
  ).trim();
  if (!caption) throw new Error('Не вдалося написати підпис. Спробуй ще раз.');
  return caption;
}

// ── pure ──────────────────────────────────────────────────────────────────

/** One string field, or null when the model omitted it or sent the wrong type. */
export function stringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Parse a model's JSON reply.
 *
 * Tolerant on purpose: a reply fenced in ```json, or with a sentence before the
 * object, is common enough that failing on it would make the button unreliable
 * for no reason. What it will NOT do is invent content — with nothing usable it
 * throws, and the caller leaves her text exactly as it was.
 */
export function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // fall through to the brace scan
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // give up below
    }
  }

  throw new Error('Модель повернула щось незрозуміле. Спробуй ще раз.');
}

/**
 * Strip the things that get read aloud by mistake.
 *
 * Models reliably reach for «Хук:», «Сцена 1:», a leading number or a markdown
 * bullet however firmly the prompt forbids it, and every one of those ends up
 * spoken to camera — the whole point of the script screen is that it is copied
 * out verbatim.
 */
export function normalizeScript(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*[-*•]\s+/, '')
        .replace(/^\s*\d+[.)]\s+/, '')
        .replace(/^\s*(?:хук|hook|сцена\s*\d*|scene\s*\d*|cta|заклик|інтро|intro|висновок)\s*[:—-]\s*/i, '')
        .replace(/\*\*/g, '')
        .trimEnd(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The note's text as blocks — one paragraph per block, blank lines dropped. */
export function toParagraphs(script: string): string[] {
  return normalizeScript(script)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
