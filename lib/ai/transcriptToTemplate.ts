import { requireServerEnv } from '@/lib/env';

export interface TemplateSceneDraft {
  text: string;
}

interface TemplateResponse {
  title?: string;
  scenes?: Array<{ text?: string }>;
}

const SYSTEM_PROMPT = [
  'You convert a spoken video transcript into a REUSABLE SCENARIO TEMPLATE.',
  '',
  '## Rules',
  '- Preserve the hook, pacing, and rhetorical structure (listicles, contrasts, story beats).',
  '- Replace specific facts with short placeholders in square brackets: e.g. "5 ways to lose weight" → "5 ways to [achieve dream outcome]".',
  '- Use concise English or Ukrainian inside brackets to match the transcript language.',
  '- Do NOT copy long verbatim stretches; generalize names, numbers, brands, and niche topics.',
  '- Each scene is one speaking beat (~3–6 seconds). Minimum 3 scenes, maximum 14.',
  '- Write only what the creator would say on camera — no stage directions.',
  '',
  '## Output',
  'JSON only, no markdown:',
  '{"title":"short project name (≤48 chars)","scenes":[{"text":"..."},...]}',
].join('\n');

export async function templatizeTranscriptToScenes(
  transcript: string
): Promise<{ title: string; scenes: TemplateSceneDraft[] }> {
  const apiKey = requireServerEnv('GROQ_API_KEY');
  const trimmed = transcript.trim();
  if (!trimmed) {
    throw new Error('Транскрипт порожній.');
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      temperature: 0.45,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Transcript:\n\n${trimmed.slice(0, 14_000)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq template step failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const rawText = payload.choices?.[0]?.message?.content?.trim();
  if (!rawText) {
    throw new Error('AI повернув порожню відповідь.');
  }

  let parsed: TemplateResponse;
  try {
    parsed = JSON.parse(rawText) as TemplateResponse;
  } catch {
    throw new Error('AI повернув невалідний JSON.');
  }

  const scenes: TemplateSceneDraft[] =
    parsed.scenes
      ?.map((s) => ({ text: (s.text ?? '').trim() }))
      .filter((s) => s.text.length > 0) ?? [];

  if (scenes.length === 0) {
    throw new Error('AI не зміг побудувати шаблон сцен.');
  }

  const title = (parsed.title ?? '').trim() || 'Рілс з конкурента';

  return { title, scenes };
}
