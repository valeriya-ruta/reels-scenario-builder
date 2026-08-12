/**
 * Central OpenRouter config for every server-side AI call — text generation
 * (carousel / reel / storytelling / transcript→template / proposals) and
 * speech-to-text (reel + braindump transcription).
 *
 * This replaces the previous direct-to-Groq integration. OpenRouter speaks the
 * same OpenAI-compatible wire format, so per-call-site the only differences are
 * the base URL, the namespaced (`vendor/model`) slug and the key. Keeping all
 * three here means a future model deprecation — the failure that once broke
 * every generator at once — stays a one-line change, and both models can be
 * swapped without a redeploy via OPENROUTER_MODEL / OPENROUTER_STT_MODEL.
 */
import { optionalServerEnv, requireServerEnv } from '@/lib/env';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const OPENROUTER_CHAT_URL = `${OPENROUTER_BASE_URL}/chat/completions`;
export const OPENROUTER_TRANSCRIPTIONS_URL = `${OPENROUTER_BASE_URL}/audio/transcriptions`;

/**
 * Same weights the Groq integration ran on (`llama-3.3-70b-versatile`), and it
 * supports the `json_object` response format every caller relies on. OpenRouter
 * treats `response_format` as a routing preference, so requests only land on
 * providers that honour JSON mode.
 */
export const OPENROUTER_TEXT_MODEL =
  process.env.OPENROUTER_MODEL?.trim() || 'meta-llama/llama-3.3-70b-instruct';

/**
 * Whisper turbo — the same model the app transcribed with before, and on
 * OpenRouter it is served by Groq upstream, so transcription quality, latency
 * and the verbose-JSON timestamps are unchanged.
 */
export const OPENROUTER_STT_MODEL =
  process.env.OPENROUTER_STT_MODEL?.trim() || 'openai/whisper-large-v3-turbo';

export function requireOpenRouterKey(): string {
  return requireServerEnv('OPENROUTER_API_KEY');
}

/** Optional app attribution — breaks usage down per app in the OpenRouter dashboard. */
function attributionHeaders(): Record<string, string> {
  const siteUrl = optionalServerEnv('OPENROUTER_SITE_URL');
  return {
    'X-OpenRouter-Title': 'Ruta',
    ...(siteUrl ? { 'HTTP-Referer': siteUrl } : {}),
  };
}

/** Headers for JSON bodies (chat completions). */
export function openRouterJsonHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
    ...attributionHeaders(),
  };
}

/**
 * Headers for multipart uploads (transcriptions) — no explicit content-type, so
 * `fetch` sets the multipart boundary itself.
 */
export function openRouterUploadHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...attributionHeaders(),
  };
}
