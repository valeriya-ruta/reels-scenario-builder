/**
 * Minimal OpenRouter chat client for the model bake-off.
 *
 * Deliberately NOT a shared app helper — the bake-off runs offline against
 * production prompts and must not become a dependency of the app. The real
 * `lib/openrouter.ts` helper is task 86d3ymar8's job.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const GENERATION_ENDPOINT = 'https://openrouter.ai/api/v1/generation';

export function requireKey() {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'Missing OPENROUTER_API_KEY.\n' +
        '  Get one at https://openrouter.ai/keys, then:\n' +
        '    export OPENROUTER_API_KEY=sk-or-v1-...\n' +
        '  (This is for running the bake-off locally. It is NOT the Vercel env var —\n' +
        '   that one gets added later, when the app itself migrates.)',
    );
  }
  return key;
}

/** Strips ```json fences some models add despite being told not to. */
export function extractJson(text) {
  const raw = (text ?? '').trim();
  if (!raw) return { parsed: null, fenced: false, error: 'empty response' };

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw;

  try {
    return { parsed: JSON.parse(candidate), fenced: Boolean(fenceMatch), error: null };
  } catch {
    // Last resort: the outermost {...} span.
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return {
          parsed: JSON.parse(candidate.slice(start, end + 1)),
          fenced: true,
          error: null,
        };
      } catch { /* fall through */ }
    }
    return { parsed: null, fenced: Boolean(fenceMatch), error: 'invalid JSON' };
  }
}

async function post(key, body) {
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      // OpenRouter attribution headers — harmless, keeps the dashboard readable.
      'HTTP-Referer': 'https://github.com/valeriya-ruta/reels-scenario-builder',
      'X-Title': 'Ruta bake-off',
    },
    body: JSON.stringify(body),
  });
}

/**
 * One chat completion.
 *
 * `response_format: json_object` is sent first because every production call
 * site uses it. Models that reject it are retried once without it, and the
 * result is flagged — needing the retry is itself a finding worth reporting.
 */
export async function complete({ key, model, messages, temperature, maxTokens, jsonMode = true }) {
  const base = {
    model,
    messages,
    temperature,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
  };

  const started = Date.now();
  let jsonModeRejected = false;
  let res = await post(key, jsonMode ? { ...base, response_format: { type: 'json_object' } } : base);

  if (!res.ok && jsonMode && (res.status === 400 || res.status === 404 || res.status === 422)) {
    jsonModeRejected = true;
    res = await post(key, base);
  }

  const latencyMs = Date.now() - started;

  if (!res.ok) {
    const body = await res.text();
    return {
      ok: false,
      latencyMs,
      error: `HTTP ${res.status}: ${body.slice(0, 400)}`,
      jsonModeRejected,
    };
  }

  const payload = await res.json();
  const text = payload?.choices?.[0]?.message?.content ?? '';

  return {
    ok: true,
    latencyMs,
    generationId: payload?.id ?? null,
    text,
    usage: payload?.usage ?? null,
    finishReason: payload?.choices?.[0]?.finish_reason ?? null,
    jsonModeRejected,
  };
}

/**
 * Best-effort cost lookup. OpenRouter settles cost asynchronously, so this
 * polls briefly and gives up quietly — a missing cost must never fail a run.
 */
export async function fetchCost(key, generationId, { attempts = 3, delayMs = 900 } = {}) {
  if (!generationId) return null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${GENERATION_ENDPOINT}?id=${encodeURIComponent(generationId)}`, {
        headers: { authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        const body = await res.json();
        const cost = body?.data?.total_cost;
        if (typeof cost === 'number') return cost;
      }
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}
