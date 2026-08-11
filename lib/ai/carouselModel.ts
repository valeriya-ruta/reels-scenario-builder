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

async function callOpenRouter(apiKey: string, systemPrompt: string, userContent: string): Promise<string> {
  const appUrl = optionalServerEnv('NEXT_PUBLIC_APP_URL') ?? 'https://ruta.app';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

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
  const res = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: {
        temperature: TEMPERATURE,
        responseMimeType: 'application/json',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    }),
  });

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
