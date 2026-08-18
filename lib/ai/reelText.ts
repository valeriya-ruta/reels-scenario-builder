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
  'No emoji, no hashtags, no markdown, no stage directions, no labels.',
  'Never address the author. Never explain what you did.',
  'Plain spoken sentences only — this text is read aloud verbatim.',
].join('\n');

const INSTRUCTION: Record<RewriteMode, string> = {
  reel: [
    'Turn this raw dump into a reel script.',
    'The FIRST paragraph must be a hook: one short line that makes someone stop scrolling. Build it from what she actually said, never from an invented claim.',
    'Then the body, in her order, tightened — cut repetition, filler and false starts.',
    'End with one closing line. No call to action unless she asked for one herself.',
    'One thought per paragraph. Separate paragraphs with a blank line.',
    'Keep it under about 45 seconds spoken (roughly 120 words).',
  ].join('\n'),
  shorter: [
    'Make this shorter and tighter without losing any idea in it.',
    'Cut filler, repetition and hedging. Keep every distinct point.',
    'Keep the same paragraph breaks where the ideas still divide that way.',
  ].join('\n'),
  longer: [
    'Expand this a little: add the concrete detail and the example that are implied but missing.',
    'Do NOT add new claims, new facts or new opinions she did not make.',
    'Keep it spoken and plain. At most half again as long.',
  ].join('\n'),
};

/**
 * One completion, through whichever vendor this deployment is configured for.
 *
 * `chatEndpoint` prefers OpenRouter when its key is present and falls back to
 * Groq — both speak the OpenAI shape, so this call is identical either way.
 */
async function complete(system: string, user: string): Promise<Record<string, unknown>> {
  const endpoint = chatEndpoint();
  const res = await fetch(endpoint.url, {
    method: 'POST',
    headers: endpoint.headers,
    body: JSON.stringify({
      model: endpoint.model,
      temperature: 0.6,
      response_format: { type: 'json_object' },
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
  return parseJsonObject(payload.choices?.[0]?.message?.content ?? '');
}

/** Rewrite the whole note, or just the phrase she selected. */
export async function rewriteReelText(
  text: string,
  mode: RewriteMode,
): Promise<{ text: string; title: string | null }> {
  const lang = detectOutputLanguage(text);
  const system = [VOICE_RULES, LANGUAGE_RULE[lang], INSTRUCTION[mode]].join('\n\n');
  const wantsTitle = mode === 'reel';

  const user = [
    wantsTitle
      ? 'Return JSON: {"script":"<the script, paragraphs separated by \\n\\n>","title":"<3-5 word name for this reel>"}'
      : 'Return JSON: {"script":"<the rewritten text, paragraphs separated by \\n\\n>"}',
    '',
    'TEXT:',
    text,
  ].join('\n');

  const reply = await complete(system, user);
  const script = stringField(reply, 'script');
  if (!script) throw new Error('Модель повернула щось незрозуміле. Спробуй ще раз.');

  // The title is a nice-to-have: a good script with no name is fine, a failure
  // because the model skipped one field is not.
  const title = wantsTitle ? (stringField(reply, 'title')?.slice(0, 80) ?? null) : null;
  return { text: normalizeScript(script), title };
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

  const reply = await complete(system, `Return JSON: {"caption":"<the caption>"}\n\nSCRIPT:\n${script}`);
  const caption = stringField(reply, 'caption');
  if (!caption) throw new Error('Не вдалося написати підпис. Спробуй ще раз.');
  return caption.trim();
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
