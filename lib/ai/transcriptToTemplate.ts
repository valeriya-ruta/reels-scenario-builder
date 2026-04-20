import { requireServerEnv } from '@/lib/env';

export interface TemplateSceneDraft {
  text: string;
}

export interface TemplatizeReferenceContext {
  referenceUrl?: string | null;
  referenceNote?: string | null;
}

interface TemplateResponse {
  title?: string;
  scenes?: Array<{ text?: string }>;
}

function toNonEmptyScenes(parsed: TemplateResponse): TemplateSceneDraft[] {
  return (
    parsed.scenes
      ?.map((s) => ({ text: (s.text ?? '').trim() }))
      .filter((s) => s.text.length > 0) ?? []
  );
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
  '- If the user message includes "Нотатка автора", treat it as the primary creative brief when it conflicts with a sparse transcript.',
  '',
  '## Output',
  'JSON only, no markdown:',
  '{"title":"short project name (≤48 chars)","scenes":[{"text":"..."},...]}',
].join('\n');

const SYSTEM_PROMPT_BRIEF_ONLY = [
  'The spoken transcript is missing or unusable (e.g. meme, format, or music-only reel).',
  'Build a REUSABLE SCENARIO TEMPLATE from the author note and optional reference URL.',
  '',
  '## Rules',
  '- Follow the author note as the main creative brief.',
  '- Use short placeholders in square brackets for niche specifics.',
  '- Each scene is one speaking beat (~3–6 seconds). Minimum 3 scenes, maximum 14.',
  '- Write only what the creator would say on camera — no stage directions.',
  '',
  '## Output',
  'JSON only, no markdown:',
  '{"title":"short project name (≤48 chars)","scenes":[{"text":"..."},...]}',
].join('\n');

/** Order: reference URL, author note, then transcript — note before transcript for Groq. */
export function buildCreativeBriefUserContent(
  transcript: string,
  context?: TemplatizeReferenceContext
): string {
  const parts: string[] = [];
  const u = context?.referenceUrl?.trim();
  const n = context?.referenceNote?.trim();
  const t = transcript.trim();
  if (u) parts.push(`Референс-рілс: ${u}`);
  if (n) parts.push(`Нотатка автора: ${n}`);
  if (t) parts.push(`Транскрипт референсу: ${t.slice(0, 14_000)}`);
  return parts.join('\n\n');
}

export async function templatizeTranscriptToScenes(
  transcript: string,
  context?: TemplatizeReferenceContext
): Promise<{ title: string; scenes: TemplateSceneDraft[] }> {
  const apiKey = requireServerEnv('GROQ_API_KEY');
  const trimmed = transcript.trim();
  const refUrl = context?.referenceUrl?.trim() ?? '';
  const refNote = context?.referenceNote?.trim() ?? '';
  const userBody = buildCreativeBriefUserContent(transcript, context);
  if (!userBody.trim()) {
    throw new Error('Транскрипт порожній.');
  }

  const useBriefOnly = !trimmed && (Boolean(refUrl) || Boolean(refNote));
  const systemContent = useBriefOnly ? SYSTEM_PROMPT_BRIEF_ONLY : SYSTEM_PROMPT;

  let lastReason = 'невідома помилка';
  let lastRawPreview = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const repairInstruction =
      attempt === 1
        ? '\n\nIMPORTANT REPAIR: Return JSON with key "scenes" only as an array of objects like {"text":"..."}. Minimum 3 non-empty scenes.'
        : '';

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
          { role: 'system', content: systemContent },
          {
            role: 'user',
            content: `${userBody.slice(0, 20_000)}${repairInstruction}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      lastReason = `Groq template step failed (${res.status})`;
      lastRawPreview = body.slice(0, 300);
      continue;
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawText = payload.choices?.[0]?.message?.content?.trim();
    if (!rawText) {
      lastReason = 'AI повернув порожню відповідь.';
      continue;
    }

    lastRawPreview = rawText.slice(0, 300);

    let parsed: TemplateResponse;
    try {
      parsed = JSON.parse(rawText) as TemplateResponse;
    } catch {
      lastReason = 'AI повернув невалідний JSON.';
      continue;
    }

    const scenes = toNonEmptyScenes(parsed);
    if (scenes.length === 0) {
      lastReason = 'AI повернув JSON без валідних сцен.';
      continue;
    }

    const title = (parsed.title ?? '').trim() || 'Рілс з конкурента';
    return { title, scenes };
  }

  throw new Error(
    `AI не зміг побудувати шаблон сцен. Причина: ${lastReason}. Preview: ${lastRawPreview}`
  );
}
