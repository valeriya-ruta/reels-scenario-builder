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
  openrouter: () => optionalServerEnv('OPENROUTER_MODEL') ?? 'meta-llama/llama-3.3-70b-instruct',
};

/** Whisper large v3 turbo on both — the model the transcripts were tuned on. */
const STT_MODEL: Record<AiVendor, () => string> = {
  groq: () => optionalServerEnv('GROQ_STT_MODEL') ?? 'whisper-large-v3-turbo',
  openrouter: () => optionalServerEnv('OPENROUTER_STT_MODEL') ?? 'openai/whisper-large-v3-turbo',
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

/** Where audio transcriptions go. No Content-Type — FormData sets its own. */
export function sttEndpoint(): AiEndpoint {
  const { vendor, apiKey } = requireVendor();
  return {
    vendor,
    url: `${BASE_URL[vendor]}/audio/transcriptions`,
    model: STT_MODEL[vendor](),
    headers: { Authorization: `Bearer ${apiKey}` },
  };
}

/**
 * Upload audio for transcription, whichever vendor is configured.
 *
 * Both take OpenAI's multipart shape (`file` + `model`), so the request is
 * identical — except for `verbose_json`, which is what carries the per-line
 * timings the scene splitter reads. OpenRouter only offers it on
 * OpenAI-compatible providers and returns 400 elsewhere, so a rejection is
 * retried plainly: a transcript without timings is worth far more than a failed
 * transcript, and the splitter already falls back to one scene when they are
 * missing.
 *
 * Caller keeps the response, including failures — the existing error text
 * («Помилка транскрипції (400): …») is what surfaces to the user.
 */
export async function transcribeFile(file: File, language?: string): Promise<Response> {
  const stt = sttEndpoint();

  const send = (verbose: boolean) => {
    const form = new FormData();
    form.append('model', stt.model);
    if (verbose) {
      form.append('response_format', 'verbose_json');
      form.append('temperature', '0');
    }
    if (language) form.append('language', language);
    form.append('file', file);
    return fetch(stt.url, { method: 'POST', headers: stt.headers, body: form });
  };

  const res = await send(true);
  if (res.status !== 400 || stt.vendor !== 'openrouter') return res;

  const body = await res
    .clone()
    .text()
    .catch(() => '');
  if (!/response_format|verbose_json|timestamp/i.test(body)) return res;
  return send(false);
}
