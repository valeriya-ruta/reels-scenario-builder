import 'server-only';

import { requireServerEnv } from '@/lib/env';

/**
 * One shared OpenRouter client for every AI call in the app (task 86d3ymar8).
 *
 * This is a pure plumbing swap: the same models, prompts, temperatures and
 * max_tokens that used to hit Groq (text + Whisper) and Gemini (scene split)
 * now flow through OpenRouter so all AI spend lands on one dashboard. Call sites
 * keep building their own request bodies (prompt/temperature/max_tokens live at
 * the call site, unchanged) and hand them to the helpers here, which own only
 * the endpoint, auth, model slug, and provider preference.
 *
 * Model slugs map 1:1 to the models in use before the swap:
 *   - meta-llama/llama-3.3-70b-instruct  == Groq `llama-3.3-70b-versatile`
 *   - google/gemini-2.5-flash            == Gemini `gemini-2.5-flash`
 *   - openai/whisper-large-v3-turbo      == Groq `whisper-large-v3-turbo`
 *
 * Provider preference pins each text/scene model to the backend it ran on before
 * (Groq for Llama, Google AI Studio for Gemini) so output stays equivalent to
 * today. Fallbacks stay ON (OpenRouter's default), so a provider blip degrades
 * to the SAME model on another provider instead of hard-failing production.
 */

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/** Llama text model — same model as Groq `llama-3.3-70b-versatile`. Overridable. */
export const OPENROUTER_TEXT_MODEL =
  process.env.OPENROUTER_TEXT_MODEL?.trim() || 'meta-llama/llama-3.3-70b-instruct';

/** Scene-splitting model — same model as Gemini `gemini-2.5-flash`. Overridable. */
export const OPENROUTER_GEMINI_MODEL =
  process.env.OPENROUTER_GEMINI_MODEL?.trim() || 'google/gemini-2.5-flash';

/** Whisper model — same model as Groq `whisper-large-v3-turbo`. Overridable. */
export const OPENROUTER_WHISPER_MODEL =
  process.env.OPENROUTER_WHISPER_MODEL?.trim() || 'openai/whisper-large-v3-turbo';

/**
 * Pin each model to the provider it ran on before the swap so inference is
 * identical to today. Keyed by resolved model slug; unknown slugs get no pin
 * (OpenRouter's default routing).
 */
const PROVIDER_ORDER: Record<string, string[]> = {
  [OPENROUTER_TEXT_MODEL]: ['groq'],
  [OPENROUTER_GEMINI_MODEL]: ['google-ai-studio', 'google-vertex'],
};

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type OpenRouterChatResult =
  | { ok: true; content: string | undefined }
  | { ok: false; status: number; bodyText: string };

/**
 * JSON-mode chat completion through OpenRouter. Always requests
 * `response_format: { type: 'json_object' }` — every current caller relies on it.
 * Returns the raw assistant content (untrimmed) so each caller keeps its exact
 * trim/parse/error behavior. Network errors propagate, mirroring a raw `fetch`.
 */
export async function openRouterChatJSON(params: {
  model: string;
  temperature: number;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<OpenRouterChatResult> {
  const apiKey = requireServerEnv('OPENROUTER_API_KEY');

  const body: Record<string, unknown> = {
    model: params.model,
    temperature: params.temperature,
    response_format: { type: 'json_object' },
    messages: params.messages,
  };
  if (typeof params.maxTokens === 'number') {
    body.max_tokens = params.maxTokens;
  }
  const providerOrder = PROVIDER_ORDER[params.model];
  if (providerOrder) {
    body.provider = { order: providerOrder };
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    return { ok: false, status: res.status, bodyText };
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return { ok: true, content: payload.choices?.[0]?.message?.content };
}

/**
 * Whisper transcription through OpenRouter's OpenAI-compatible
 * `/audio/transcriptions` endpoint. Builds the same multipart form the Groq path
 * used (`whisper-large-v3-turbo`, `verbose_json`, `temperature=0`, optional
 * `language`) and returns the raw `Response` so callers keep their existing
 * ok/text/json handling. `verbose_json` yields the `segments[]` timestamps the
 * app depends on (served by the Groq provider for this model).
 */
export async function openRouterTranscribe(params: {
  file: File;
  language?: string;
}): Promise<Response> {
  const apiKey = requireServerEnv('OPENROUTER_API_KEY');

  const formData = new FormData();
  formData.append('model', OPENROUTER_WHISPER_MODEL);
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');
  if (params.language) {
    formData.append('language', params.language);
  }
  formData.append('file', params.file);

  return fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });
}
