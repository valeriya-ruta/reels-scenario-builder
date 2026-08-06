/**
 * Capture the EXACT outbound AI request contract that this checkout's real
 * generation code builds for one fixed braindump — with no API key and no live
 * model call. `global.fetch` is intercepted: the request is recorded and a canned
 * response is returned so each generator runs to (or past) the network boundary.
 *
 * Run it in the current tree (AFTER = OpenRouter) and in a pre-migration worktree
 * (BEFORE = Groq/Gemini); diffing the two JSON captures proves the swap changed
 * only the pipe (endpoint + auth + model slug), never the prompt/temperature/
 * max_tokens. Output: JSON on stdout.
 *
 *   node --import ./scripts/proof/_register.mjs ./scripts/proof/openrouter-capture.mjs
 */

// Keys for whichever pipe this checkout uses. Values are placeholders — no real
// call is made.
process.env.OPENROUTER_API_KEY = 'proof-key';
process.env.GROQ_API_KEY = 'proof-key';
process.env.GEMINI_API_KEY = 'proof-key';

// ── One real braindump, reused for every generator ──────────────────────────
const BRAINDUMP =
  'Я три роки боялася показувати обличчя на камеру. Думала, що треба ідеальне світло, ' +
  'дорогий мікрофон і сценарій на п’ять сторінок. А потім записала перший рілс на телефон ' +
  'у машині, без монтажу, і саме він зібрав більше переглядів, ніж усе, що я робила «правильно». ' +
  'Виявилось, людям не потрібна ідеальність — їм потрібна жива ти. Тепер знімаю щодня по дорозі на роботу.';

const STORYTELLING_NAME = 'Як я перестала боятися камери';

const TRANSCRIPT_SEGMENTS = [
  { startSec: 0.0, endSec: 3.2, text: 'Я три роки боялася показувати обличчя на камеру.' },
  { startSec: 3.2, endSec: 7.5, text: 'Думала, що треба ідеальне світло і дорогий мікрофон.' },
  { startSec: 7.5, endSec: 12.0, text: 'А потім записала перший рілс на телефон у машині.' },
  { startSec: 12.0, endSec: 16.4, text: 'І саме він зібрав більше переглядів, ніж усе інше.' },
];
const TRANSCRIPT_TEXT = TRANSCRIPT_SEGMENTS.map((s) => s.text).join(' ');

const PROPOSAL_SIGNALS = [
  { kind: 'proven', label: 'Рілс «перший запис у машині»', ageDays: 5 },
  { kind: 'unused-dump', label: 'Дамп про страх камери', ageDays: 3 },
];

// ── fetch interceptor ───────────────────────────────────────────────────────
const captured = [];
function providerFromUrl(url) {
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('api.groq.com')) return 'groq';
  if (url.includes('generativelanguage.googleapis.com')) return 'gemini';
  return 'other';
}
function cannedFor(url) {
  // Every text generator only needs a parseable (even if minimal) JSON string;
  // the request is already recorded before the body is read.
  const emptyJson = JSON.stringify({});
  if (url.includes('generativelanguage.googleapis.com')) {
    return { candidates: [{ content: { parts: [{ text: emptyJson }] } }] };
  }
  // Groq + OpenRouter chat completions share the OpenAI shape.
  return { choices: [{ message: { content: emptyJson } }] };
}

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const provider = providerFromUrl(url);
  let body = null;
  if (init.body && typeof init.body === 'string') {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = '[unparseable string body]';
    }
  } else if (init.body) {
    body = '[non-JSON body: ' + init.body.constructor?.name + ']';
  }
  const headers = init.headers || {};
  const auth = headers.authorization || headers.Authorization || null;
  captured.push({
    url,
    provider,
    authScheme: auth ? String(auth).split(' ')[0] : null,
    body,
  });
  return new Response(JSON.stringify(cannedFor(url)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

// ── run each generator; record the first request it makes ───────────────────
const results = {};
async function run(name, fn) {
  const before = captured.length;
  try {
    await fn();
  } catch (e) {
    // Post-capture parse failures are expected (canned response is empty JSON).
    results[name] = results[name] || {};
    results[name].note = `generator threw after request (expected): ${e.message}`;
  }
  const first = captured[before];
  results[name] = {
    ...(results[name] || {}),
    request: first
      ? {
          provider: first.provider,
          authScheme: first.authScheme,
          model: first.body?.model ?? '(gemini native: in URL)',
          temperature:
            first.body?.temperature ?? first.body?.generationConfig?.temperature ?? null,
          max_tokens: first.body?.max_tokens ?? null,
          response_format:
            first.body?.response_format ??
            (first.body?.generationConfig?.responseMimeType
              ? { responseMimeType: first.body.generationConfig.responseMimeType }
              : null),
          provider_order: first.body?.provider?.order ?? null,
          // Normalize Groq-native (messages) vs Gemini-native (contents/parts).
          messages:
            first.body?.messages ??
            (first.body?.contents
              ? first.body.contents.map((c) => ({
                  role: c.role,
                  content: (c.parts || []).map((p) => p.text).join(''),
                }))
              : null),
          url: first.url,
        }
      : null,
  };
}

const reel = await import('@/lib/ai/rantToScript');
await run('reel_scenario', () => reel.transformRantToScript(BRAINDUMP));

const stories = await import('@/lib/ai/rantToStories');
await run('storytelling', () => stories.generateStoriesFromRant(BRAINDUMP, STORYTELLING_NAME));

const scenes = await import('@/lib/ai/sceneSegmentation');
await run('scene_split', () =>
  scenes.splitTranscriptIntoScenes(TRANSCRIPT_TEXT, TRANSCRIPT_SEGMENTS),
);

const propose = await import('@/lib/propose/proposeAngles');
await run('idea_angles', () => propose.proposeAngles(PROPOSAL_SIGNALS, []));

const template = await import('@/lib/ai/transcriptToTemplate');
await run('transcript_template', () => template.templatizeTranscriptToScenes(TRANSCRIPT_TEXT));

process.stdout.write(JSON.stringify(results, null, 2) + '\n');
