import 'server-only';
import { optionalServerEnv, requireServerEnv } from '@/lib/env';

/**
 * Carousel text generation, pointed at the bake-off winner: Gemini 2.5 Pro
 * (ClickUp 86d3ymaw7). It won on voice/style across two very different braindumps.
 *
 * Provider selection, in order:
 *   1. OPENROUTER_API_KEY set → OpenRouter `google/gemini-2.5-pro`. This is the
 *      target once the OpenRouter billing migration (86d3ymar8) lands — set the
 *      key and this path takes over with zero code change.
 *   2. else GEMINI_API_KEY (already in production for scene splitting) → Gemini's
 *      own API `gemini-2.5-pro`. Ships today with no new env.
 *
 * Same model either way. Returns the raw JSON string; the caller parses and runs
 * `postProcessCarouselRant`.
 */

export const CAROUSEL_MODEL_OPENROUTER = 'google/gemini-2.5-pro';
export const CAROUSEL_MODEL_GEMINI = 'gemini-2.5-pro';

// Gemini 2.5 Pro is a reasoning model: internal "thinking" consumes output
// budget, so give it plenty of headroom or a long carousel truncates mid-JSON.
const MAX_OUTPUT_TOKENS = 8000;
const TEMPERATURE = 0.7;

// Left unbounded, Gemini 2.5 Pro's dynamic "thinking" can run many thousands of
// tokens and push a single carousel well past a minute — the "it takes forever /
// never creates" latency. Cap it so generation reliably finishes inside the 60s
// serverless window while still leaving ample reasoning for the prompt's voice
// rules. Env-tunable: raise a little for more polish, lower if still too slow.
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
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('OpenRouter returned empty content');
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
