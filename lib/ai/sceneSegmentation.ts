import { requireServerEnv } from '@/lib/env';
import type { TranscriptSegment } from './sttProvider';

export interface SceneDraft {
  text: string;
  startSec: number;
  endSec: number;
}

interface GeminiBoundaryResponse {
  scenes?: Array<{
    segmentIndexes?: number[];
  }>;
}

function normalizeIndexes(indexes: number[], segmentCount: number): number[] {
  const deduped = [...new Set(indexes)]
    .map((idx) => Number(idx))
    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < segmentCount);
  deduped.sort((a, b) => a - b);
  return deduped;
}

function buildDraftsFromIndexes(
  segments: TranscriptSegment[],
  sceneIndexes: number[][]
): SceneDraft[] {
  const drafts: SceneDraft[] = [];

  for (const indexes of sceneIndexes) {
    const chunk = indexes.map((idx) => segments[idx]).filter(Boolean);
    if (chunk.length === 0) continue;

    const text = chunk
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!text) continue;

    drafts.push({
      text,
      startSec: chunk[0].startSec,
      endSec: chunk[chunk.length - 1].endSec,
    });
  }

  return drafts;
}

function fallbackSceneDrafts(segments: TranscriptSegment[]): SceneDraft[] {
  const maxSegmentsPerScene = 4;
  const result: SceneDraft[] = [];

  for (let i = 0; i < segments.length; i += maxSegmentsPerScene) {
    const part = segments.slice(i, i + maxSegmentsPerScene);
    const text = part.map((seg) => seg.text).join(' ').trim();
    if (!text) continue;
    result.push({
      text,
      startSec: part[0].startSec,
      endSec: part[part.length - 1].endSec,
    });
  }

  return result;
}

export async function splitTranscriptIntoScenes(
  transcript: string,
  segments: TranscriptSegment[]
): Promise<SceneDraft[]> {
  if (segments.length === 0) {
    const clean = transcript.trim();
    return clean
      ? [
          {
            text: clean,
            startSec: 0,
            endSec: 0,
          },
        ]
      : [];
  }

  const apiKey = requireServerEnv('GEMINI_API_KEY');
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  const prompt = [
    'You are splitting a reel transcript into logical scenes.',
    'Important constraints:',
    '- Output JSON only.',
    '- Do NOT rewrite or invent text.',
    '- Each scene must only reference existing segment indexes.',
    '- Keep the original segment order.',
    '- Prefer grouping by idea shifts; scene count should be reasonable for a short reel.',
    '- Return schema: {"scenes":[{"segmentIndexes":[0,1]}]}',
    '',
    `Full transcript: ${transcript}`,
    '',
    'Segments:',
    ...segments.map(
      (segment, idx) =>
        `${idx}. [${segment.startSec.toFixed(2)}-${segment.endSec.toFixed(2)}] ${segment.text}`
    ),
  ].join('\n');

  const res = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini scene split failed (${res.status}): ${body}`);
  }

  const payload = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!rawText) {
    return fallbackSceneDrafts(segments);
  }

  let parsed: GeminiBoundaryResponse | null = null;
  try {
    parsed = JSON.parse(rawText) as GeminiBoundaryResponse;
  } catch {
    return fallbackSceneDrafts(segments);
  }

  const sceneIndexes =
    parsed.scenes
      ?.map((scene) => normalizeIndexes(scene.segmentIndexes ?? [], segments.length))
      .filter((indexes) => indexes.length > 0) ?? [];

  const drafts = buildDraftsFromIndexes(segments, sceneIndexes);
  if (drafts.length === 0) {
    return fallbackSceneDrafts(segments);
  }

  return drafts;
}
