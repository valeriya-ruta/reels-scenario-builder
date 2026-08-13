import 'server-only';
import { optionalServerEnv, requireServerEnv } from '@/lib/env';

/**
 * Carousel text generation. Two candidates, one env switch:
 *   • gemini-2.5-flash (current default) — fast; finishes comfortably inside the
 *     60s serverless limit.
 *   • gemini-2.5-pro — bake-off winner on voice/style, but a heavy reasoning model
 *     that can approach/exceed 60s on long carousels and time out.
 * Flash is the default for reliability; set CAROUSEL_MODEL to override either way
 * (e.g. CAROUSEL_MODEL=gemini-2.5-pro) with no deploy. The latency safety net below
 * (bounded thinking + a hard fetch timeout) applies to whichever model runs, and a
 * timeout surfaces a visible, retryable error in the braindump UI, not a freeze.
 *
 * Provider selection, in order:
 *   1. OPENROUTER_API_KEY set → OpenRouter (the consolidated-billing target).
 *   2. else GEMINI_API_KEY (already in production for scene splitting) → Gemini's
 *      own API directly.
 *
 * Same model either way. Returns the raw JSON string; the caller parses and runs
 * `postProcessCarouselRant`.
 */

// One env override drives both providers, so the model can be retuned without a
// deploy. `google/` prefix is added for the OpenRouter path.
const CAROUSEL_MODEL = optionalServerEnv('CAROUSEL_MODEL') || 'gemini-2.5-flash';
export const CAROUSEL_MODEL_OPENROUTER = `google/${CAROUSEL_MODEL}`;
export const CAROUSEL_MODEL_GEMINI = CAROUSEL_MODEL;

// Reasoning models spend output budget on internal "thinking"; keep headroom so a
// long carousel never truncates mid-JSON.
const MAX_OUTPUT_TOKENS = 8000;
const TEMPERATURE = 0.7;

// Bound the reasoning tail so a run can't stall past the serverless window. Flash
// is fast enough that a modest budget keeps quality while finishing in seconds.
// Env-tunable: raise a little for more polish, lower (or 0 on Flash) if too slow.
const THINKING_BUDGET = Number(optionalServerEnv('CAROUSEL_THINKING_BUDGET')) || 2048;

// Upstream call timeout. Kept just under the route's maxDuration (60s) so a slow
// or stuck provider surfaces a clean 502 the client can retry, instead of Vercel
// hard-killing the function with an opaque 504 and losing the carousel entirely.
const MODEL_TIMEOUT_MS = Number(optionalServerEnv('CAROUSEL_MODEL_TIMEOUT_MS')) || 55_000;

/**
 * fetch with a hard timeout. On timeout the AbortController fires and we throw a
 * labelled error, so the route logs a clear cause instead of an infinite hang.
 */
async function fetchModel(url: string, init: RequestInit, provider: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`${provider} timed out after ${MODEL_TIMEOUT_MS}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenRouter(apiKey: string, systemPrompt: string, userContent: string): Promise<string> {
  const appUrl = optionalServerEnv('NEXT_PUBLIC_APP_URL') ?? 'https://ruta.app';
  const res = await fetchModel('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': appUrl,
      'X-Title': 'Ruta carousel',
    },
    body: JSON.stringify({
      model: CAROUSEL_MODEL_OPENROUTER,
      temperature: TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Bound the reasoning budget (maps to Gemini's thinkingBudget) so a run
      // can't stall on unbounded thinking. See THINKING_BUDGET.
      reasoning: { max_tokens: THINKING_BUDGET },
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  }, 'OpenRouter');

  if (!res.ok) {
    const body = await res.text();
    console.error('[carousel-model] OpenRouter error:', res.status, body.slice(0, 500));
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const choice = payload.choices?.[0];
  const text = choice?.message?.content?.trim() ?? '';
  if (!text) {
    // finish_reason distinguishes "cut off at token limit" (length) from a
    // content filter or a model that returned only reasoning — so a recurrence
    // is diagnosable from the logs instead of an opaque "empty content".
    throw new Error(`OpenRouter returned empty content (finish_reason=${choice?.finish_reason ?? 'unknown'})`);
  }
  return text;
}

async function callGeminiDirect(apiKey: string, systemPrompt: string, userContent: string): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CAROUSEL_MODEL_GEMINI}:generateContent`;
  const res = await fetchModel(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: {
        temperature: TEMPERATURE,
        responseMimeType: 'application/json',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Cap the reasoning tail so a carousel can't run away past the 60s
        // serverless window. See THINKING_BUDGET.
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      },
    }),
  }, 'Gemini');

  if (!res.ok) {
    const body = await res.text();
    console.error('[carousel-model] Gemini error:', res.status, body.slice(0, 500));
    throw new Error(`Gemini HTTP ${res.status}`);
  }

  const payload = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? '';
  if (!text) throw new Error('Gemini returned empty content');
  return text;
}

/**
 * Generate a carousel from the system + user prompt. Returns the raw JSON string
 * the model produced (fences already unlikely — both providers are in JSON mode).
 */
export async function generateCarouselRaw(systemPrompt: string, userContent: string): Promise<string> {
  const openrouterKey = optionalServerEnv('OPENROUTER_API_KEY');
  if (openrouterKey) {
    return callOpenRouter(openrouterKey, systemPrompt, userContent);
  }
  const geminiKey = requireServerEnv('GEMINI_API_KEY');
  return callGeminiDirect(geminiKey, systemPrompt, userContent);
}
