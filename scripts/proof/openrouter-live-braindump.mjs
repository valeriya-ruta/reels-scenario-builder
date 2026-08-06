/**
 * LIVE before/after acceptance: run one real braindump through reel + storytelling
 * generation on BOTH pipes, in one process, and write the actual model outputs
 * side by side. This is the "matching outputs" half of acceptance — the half that
 * needs real credentials, which the CI sandbox does not have.
 *
 * How it stays apples-to-apples: the CURRENT generator code builds each request
 * exactly once (same prompt, temperature, max_tokens). A fetch shim then either
 * passes it through to OpenRouter (AFTER) or rewrites the same body to Groq with
 * the pre-migration model slug (BEFORE). Identical prompt in, two providers out.
 *
 * Requires real keys (no call is faked here):
 *   OPENROUTER_API_KEY   — the AFTER pipe
 *   GROQ_API_KEY         — the BEFORE pipe
 *
 * Run:
 *   OPENROUTER_API_KEY=... GROQ_API_KEY=... \
 *     node --import ./scripts/proof/_register.mjs ./scripts/proof/openrouter-live-braindump.mjs
 */
import { writeFileSync } from 'node:fs';

for (const k of ['OPENROUTER_API_KEY', 'GROQ_API_KEY']) {
  if (!process.env[k]) {
    console.error(`Missing ${k}. Set both OPENROUTER_API_KEY and GROQ_API_KEY to run the live proof.`);
    process.exit(2);
  }
}

const BRAINDUMP =
  'Я три роки боялася показувати обличчя на камеру. Думала, що треба ідеальне світло, ' +
  'дорогий мікрофон і сценарій на п’ять сторінок. А потім записала перший рілс на телефон ' +
  'у машині, без монтажу, і саме він зібрав більше переглядів, ніж усе, що я робила «правильно». ' +
  'Виявилось, людям не потрібна ідеальність — їм потрібна жива ти. Тепер знімаю щодня по дорозі на роботу.';
const STORYTELLING_NAME = 'Як я перестала боятися камери';

const realFetch = globalThis.fetch;
let MODE = 'after'; // 'after' → OpenRouter passthrough; 'before' → rewrite to Groq

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (MODE === 'before' && url.includes('openrouter.ai/api/v1/chat/completions')) {
    const body = JSON.parse(init.body);
    // Same prompt/temperature/max_tokens; only the slug goes back to Groq's and
    // the provider-routing hint is dropped (Groq's native API has no such field).
    body.model = 'llama-3.3-70b-versatile';
    delete body.provider;
    return realFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  }
  return realFetch(input, init);
};

const reel = await import('@/lib/ai/rantToScript');
const stories = await import('@/lib/ai/rantToStories');

async function bothPipes(fn) {
  MODE = 'before';
  const before = await fn();
  MODE = 'after';
  const after = await fn();
  return { before, after };
}

console.log('Running reel scenario on both pipes…');
const reelR = await bothPipes(() => reel.transformRantToScript(BRAINDUMP));
console.log('Running storytelling on both pipes…');
const storyR = await bothPipes(() => stories.generateStoriesFromRant(BRAINDUMP, STORYTELLING_NAME));

const block = (label, obj) =>
  `### ${label}\n\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\`\n`;

const md = [
  '# OpenRouter migration — LIVE before/after outputs',
  '',
  'One braindump, same prompt/temperature/max_tokens, two pipes. Text generation is',
  'non-deterministic above temperature 0, so these will not be byte-identical — they',
  'demonstrate the same model producing the same *kind* of output (structure, language,',
  'voice), which is what equivalence means here. The deterministic proof that the',
  'request contract is identical is in `request-equivalence.md`.',
  '',
  '## Braindump',
  '',
  '> ' + BRAINDUMP,
  '',
  '## Reel scenario',
  '',
  block('BEFORE — Groq `llama-3.3-70b-versatile`', reelR.before),
  block('AFTER — OpenRouter `meta-llama/llama-3.3-70b-instruct` (provider: groq)', reelR.after),
  '## Storytelling',
  '',
  block('BEFORE — Groq `llama-3.3-70b-versatile`', storyR.before),
  block('AFTER — OpenRouter `meta-llama/llama-3.3-70b-instruct` (provider: groq)', storyR.after),
].join('\n');

writeFileSync('docs/proof/openrouter-migration/live-before-after.md', md);
console.log('\nWrote docs/proof/openrouter-migration/live-before-after.md');
