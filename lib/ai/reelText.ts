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
  uk: 'Answer in Ukrainian. Never Russian, never English.',
  en: 'Answer in English.',
};

/**
 * Shared house style. Repeated in every prompt because the failure it prevents
 * — the model "improving" her into a LinkedIn post — is the one that makes the
 * output unusable rather than merely imperfect.
 */
const VOICE_RULES = [
  'You are editing a script the author will say OUT LOUD to a phone camera.',
  'Keep HER voice, her words and her rhythm. Do not make it more formal.',
  'Prefer her actual phrasing over a better one you could write.',
  'No emoji, no hashtags, no markdown, no stage directions, no labels.',
  'Never address the author. Never explain what you did.',
  'Plain spoken sentences only — this text is read aloud verbatim.',
].join('\n');

const INSTRUCTION: Record<RewriteMode, string> = {
  reel: [
    'Turn this spoken dump into a script she can read to camera.',
    '',
    'DO NOT SUMMARISE. This is the failure that matters: a several-minute dump',
    'came back as three generic lines and everything she actually argued was',
    'gone. Every point, every example, every aside, every number and every name',
    'she mentioned must survive into the script. If she made six points, the',
    'script makes six points. The output should be close to the same LENGTH as',
    'the input — never a fraction of it.',
    '',
    'What you may change:',
    '- Add ONE opening line that makes someone stop scrolling, built only from',
    '  what she actually said. If her own first sentence already does that, keep it.',
    '- Remove false starts, «ееее», «ну», restarted sentences and words repeated',
    '  by accident. Nothing else.',
    '- Fix word order where speech made it tangled, and split run-on sentences.',
    '- Break it into paragraphs, one thought each, separated by a blank line.',
    '',
    'You are tidying a transcript, not writing a new post about the same topic.',
  ].join('\n'),
  shorter: [
    'Make this tighter WITHOUT losing an idea.',
    'Cut filler, hedging and repeated words — never a point, an example or a name.',
    'If a point can only go by being deleted, keep it and cut elsewhere.',
    'Keep the paragraph breaks where the ideas still divide that way.',
  ].join('\n'),
  longer: [
    'Open this out using ONLY what is already in it.',
    '',
    'You may not add a fact, an example, a claim, a statistic, a place or an',
    'opinion that is not already in her text. This is the failure that matters:',
    'asked to expand three lines about building apps from problems she knows,',
    'a model produced advice about spotting a problem in your city and building',
    'something the market wants — none of which she said. That is not expansion,',
    'it is a different person talking.',
    '',
    'What expanding actually means here: finish thoughts she left half-said,',
    'spell out a step she compressed, and give a point that got one clause a',
    'sentence of its own. If there is nothing left to unpack, return the text',
    'almost unchanged. Too short is fine; invented is not.',
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
  const user = ['Return ONLY the text. No preamble, no quotes, no JSON.', '', 'TEXT:', text].join('\n');

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
