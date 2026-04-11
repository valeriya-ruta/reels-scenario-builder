import { requireServerEnv } from '@/lib/env';

export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export interface TranscriptResult {
  language: string | null;
  transcript: string;
  segments: TranscriptSegment[];
}

interface GroqSegment {
  start?: number;
  end?: number;
  text?: string;
}

interface GroqTranscriptionResponse {
  language?: string;
  text?: string;
  segments?: GroqSegment[];
}

function normalizeSegments(segments: GroqSegment[] | undefined): TranscriptSegment[] {
  if (!segments || segments.length === 0) {
    return [];
  }

  return segments
    .map((segment) => ({
      startSec: Number(segment.start ?? 0),
      endSec: Number(segment.end ?? 0),
      text: (segment.text ?? '').trim(),
    }))
    .filter((segment) => segment.text.length > 0);
}

export async function transcribeMediaFromUrl(mediaUrl: string): Promise<TranscriptResult> {
  const apiKey = requireServerEnv('GROQ_API_KEY');

  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) {
    throw new Error(`Unable to download media for transcription (${mediaRes.status})`);
  }

  const contentType = mediaRes.headers.get('content-type') || 'audio/mp4';
  const mediaBuffer = await mediaRes.arrayBuffer();
  const mediaFile = new File([mediaBuffer], 'reel-reference.mp4', { type: contentType });

  const formData = new FormData();
  formData.append('file', mediaFile);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');
  // Omit `language` so Whisper auto-detects (e.g. Ukrainian vs English).

  const sttRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!sttRes.ok) {
    const body = await sttRes.text();
    throw new Error(`STT request failed (${sttRes.status}): ${body}`);
  }

  const parsed = (await sttRes.json()) as GroqTranscriptionResponse;
  const transcript = (parsed.text ?? '').trim();
  if (!transcript) {
    throw new Error('Transcript is empty. Try another reel URL.');
  }

  const segments = normalizeSegments(parsed.segments);
  return {
    language: parsed.language ?? null,
    transcript,
    segments,
  };
}
