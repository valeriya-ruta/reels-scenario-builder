// Deliberately NOT `server-only`: the same rule is read by the pure-logic specs
// through `aiVendor`, and `lib/env` — which this is a sibling of — is not marked
// either. Nothing here is imported from a client component.
import { optionalServerEnv } from '@/lib/env';
import { GROQ_TEXT_MODEL } from '@/lib/ai/groqModel';
import { pickVendor, type AiVendor } from '@/lib/ai/aiVendor';

/**
 * Which service the AI calls actually go to.
 *
 * Everything here — generation and transcription alike — speaks the OpenAI HTTP
 * shape, so Groq and OpenRouter differ only in a base URL, a key and a model id.
 * That is the whole reason this file can exist: one resolver, seven call sites
 * unchanged in behaviour.
 *
 * Why it exists at all: Pro runs as its own Vercel project and never had
 * GROQ_API_KEY, so every AI feature there failed — transcripts visibly
 * («Транскрипт потребує уваги»), the rest quietly. Rather than copy a Groq key
 * across projects, either key now works: set OPENROUTER_API_KEY and everything
 * routes through OpenRouter, including Whisper.
 *
 * Preference is OpenRouter when both are present, since that is the deliberate
 * choice; AI_PROVIDER pins it either way without a redeploy.
 */

export type { AiVendor } from '@/lib/ai/aiVendor';

const BASE_URL: Record<AiVendor, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

/** Same weights either way, so prompts tuned on Groq behave the same. */
const TEXT_MODEL: Record<AiVendor, () => string> = {
  groq: () => GROQ_TEXT_MODEL,
  // Gemini, by her preference — it holds her tone of voice best of the ones
  // she has compared. She named 2.5; that generation is retired, so this is the
  // current Flash. llama-3.3-70b, the previous default, turned a specific
  // spoken argument into generic Ukrainian filler («створити щось корисне і
  // потрібне людям, що буде мати успіх на ринку»), which is worse than useless
  // in text that gets read aloud. Overridable without a redeploy.
  openrouter: () => optionalServerEnv('OPENROUTER_MODEL') ?? 'google/gemini-3.7-flash',
};

/**
 * Two speech models, because two different things are being asked for.
 *
 * ACCURATE is what a dictated take is transcribed with. Whisper large v3 was
 * getting her wrong on exactly the speech she actually produces — hesitant,
 * self-interrupting, half in borrowed Instagram vocabulary — and a transcript
 * that is nearly right is worse than useless when the next step rewrites it
 * into something she reads aloud. The GPT transcriber is a language model
 * listening rather than an encoder-decoder guessing, which is the difference
 * that shows on messy speech, and it takes the priming prompt seriously.
 *
 * TIMED is Whisper, kept deliberately. It is the only one of the two that
 * returns `verbose_json` with per-line timings, and the competitor-reel splitter
 * reads those to cut a transcript into scenes. Trading working timings for a
 * better transcript there would fix nothing and break something.
 *
 * Both are overridable without a redeploy.
 */
const STT_MODEL: Record<AiVendor, () => string> = {
  groq: () => optionalServerEnv('GROQ_STT_MODEL') ?? 'whisper-large-v3',
  openrouter: () => optionalServerEnv('OPENROUTER_STT_MODEL') ?? 'openai/gpt-4o-transcribe',
};

/** Timings-capable, and the fallback when the accurate model refuses a request. */
const STT_TIMED_MODEL: Record<AiVendor, () => string> = {
  groq: () => optionalServerEnv('GROQ_STT_TIMED_MODEL') ?? 'whisper-large-v3',
  openrouter: () => optionalServerEnv('OPENROUTER_STT_TIMED_MODEL') ?? 'openai/whisper-large-v3',
};

function keyFor(vendor: AiVendor): string | null {
  return optionalServerEnv(vendor === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY');
}

/** The vendor this deployment is configured for, or null when neither key is set. */
export function resolveVendor(): AiVendor | null {
  return pickVendor({
    AI_PROVIDER: optionalServerEnv('AI_PROVIDER'),
    OPENROUTER_API_KEY: optionalServerEnv('OPENROUTER_API_KEY'),
    GROQ_API_KEY: optionalServerEnv('GROQ_API_KEY'),
  });
}

function requireVendor(): { vendor: AiVendor; apiKey: string } {
  const vendor = resolveVendor();
  const apiKey = vendor ? keyFor(vendor) : null;
  if (!vendor || !apiKey) {
    // Names BOTH variables: the old message named only GROQ_API_KEY, which was
    // an accurate but unhelpful thing to read when the fix is either one.
    throw new Error(
      'Missing AI credentials: set OPENROUTER_API_KEY (or GROQ_API_KEY) for this deployment.',
    );
  }
  return { vendor, apiKey };
}

export type AiEndpoint = {
  vendor: AiVendor;
  url: string;
  model: string;
  headers: Record<string, string>;
};

/** Where chat completions go, with the model this vendor should be asked for. */
export function chatEndpoint(): AiEndpoint {
  const { vendor, apiKey } = requireVendor();
  return {
    vendor,
    url: `${BASE_URL[vendor]}/chat/completions`,
    model: TEXT_MODEL[vendor](),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  };
}

/**
 * What a caller wants out of a transcription.
 *
 * `timed` needs per-line timings and accepts Whisper's accuracy to get them —
 * the competitor-reel splitter cuts scenes on them. `accurate` is her own
 * dictation, where nothing downstream reads a timestamp and every word matters.
 */
export type SttQuality = 'accurate' | 'timed';

/** Where audio transcriptions go. No Content-Type — FormData sets its own. */
export function sttEndpoint(quality: SttQuality = 'timed'): AiEndpoint {
  const { vendor, apiKey } = requireVendor();
  const model = quality === 'accurate' ? STT_MODEL[vendor]() : STT_TIMED_MODEL[vendor]();
  return {
    vendor,
    url: `${BASE_URL[vendor]}/audio/transcriptions`,
    model,
    headers: { Authorization: `Bearer ${apiKey}` },
  };
}

export type TranscribeOptions = {
  language?: string;
  /** Primes the decoder's vocabulary and register — see lib/ai/dictationPrompt. */
  prompt?: string;
  quality?: SttQuality;
};

/**
 * Upload audio for transcription, whichever vendor is configured.
 *
 * Every vendor and model here takes OpenAI's multipart shape (`file` + `model`),
 * so the request is identical — except for `verbose_json`, which is what carries
 * the per-line timings the scene splitter reads. Only Whisper offers it, and
 * only on OpenAI-compatible providers, so a rejection is retried plainly: a
 * transcript without timings is worth far more than a failed transcript, and the
 * splitter already falls back to one scene when they are missing.
 *
 * A request the ACCURATE model refuses outright is retried on the timed one
 * before giving up. Her voice is the way the app is used; it does not get to
 * stop working because a model id was retired or a provider had a bad minute.
 *
 * Caller keeps the response, including failures — the existing error text
 * («Помилка транскрипції (400): …») is what surfaces to the user.
 */
export async function transcribeFile(
  file: File,
  options: TranscribeOptions | string = {},
): Promise<Response> {
  // Callers used to pass a bare language string; both shapes still work.
  const opts: TranscribeOptions = typeof options === 'string' ? { language: options } : options;
  const quality = opts.quality ?? 'timed';
  const stt = sttEndpoint(quality);

  const send = (model: string, verbose: boolean) => {
    const form = new FormData();
    form.append('model', model);
    // Temperature 0 everywhere: fallback decoding is where the invented
    // «Субтитры сделал …» credits come from.
    form.append('temperature', '0');
    if (verbose) form.append('response_format', 'verbose_json');
    if (opts.language) form.append('language', opts.language);
    if (opts.prompt) form.append('prompt', opts.prompt);
    form.append('file', file);
    return fetch(stt.url, { method: 'POST', headers: stt.headers, body: form });
  };

  // Timings are asked for only when something downstream reads them. Asking the
  // accurate model for verbose_json just earns a 400 and a wasted upload.
  const wantsTimings = quality === 'timed';
  let res = await send(stt.model, wantsTimings);

  if (wantsTimings && res.status === 400 && stt.vendor === 'openrouter') {
    const body = await res
      .clone()
      .text()
      .catch(() => '');
    if (/response_format|verbose_json|timestamp/i.test(body)) res = await send(stt.model, false);
  }

  if (res.ok || quality !== 'accurate') return res;

  const fallback = STT_TIMED_MODEL[stt.vendor]();
  if (fallback === stt.model) return res;
  const retry = await send(fallback, false);
  return retry.ok ? retry : res;
}
