import 'server-only';

import { requireServerEnv } from '@/lib/env';
import { isAbsoluteHttpUrlString } from '@/lib/isAbsoluteHttpUrl';

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

const GROQ_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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

function guessInputExt(contentType: string, mediaUrl: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('webm')) return 'webm';
  if (ct.includes('wav')) return 'wav';
  if (ct.includes('mp3')) return 'mp3';
  if (ct.includes('mpeg') && !ct.includes('mpeg4')) return 'mpeg';
  if (ct.includes('quicktime')) return 'mov';
  if (ct.includes('mp4') || ct.includes('m4a') || ct.includes('mpeg4')) return 'mp4';
  try {
    const u = new URL(mediaUrl);
    const path = u.pathname.toLowerCase();
    const ext = path.match(/\.([a-z0-9]+)$/)?.[1];
    if (ext && ['mp4', 'webm', 'mov', 'mpeg', 'mpg', 'm4a', 'mp3', 'wav'].includes(ext)) {
      return ext;
    }
  } catch {
    /* ignore */
  }
  return 'mp4';
}

function buildGroqFormData(language?: string): FormData {
  const formData = new FormData();
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');
  if (language) {
    formData.append('language', language);
  }
  return formData;
}

async function groqTranscribe(apiKey: string, formData: FormData): Promise<Response> {
  return fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });
}

async function parseTranscriptionResponse(sttRes: Response): Promise<TranscriptResult> {
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

const GROQ_AUDIO_MAX_BYTES = GROQ_MAX_UPLOAD_BYTES;

/**
 * Transcribes raw audio bytes uploaded directly from the browser (MediaRecorder
 * capture), reusing the exact same Groq Whisper path as reel transcription —
 * same key, same direct-bytes FormData upload, same `whisper-large-v3-turbo`
 * model. No ffmpeg, no remote fetch. Used by the braindump voice capture.
 */
export async function transcribeAudioFile(
  audio: File | Blob,
  options: { language?: string; filename?: string } = {}
): Promise<TranscriptResult> {
  const apiKey = requireServerEnv('GROQ_API_KEY');

  const size = audio.size ?? 0;
  if (size === 0) {
    throw new Error('Порожній аудіозапис. Спробуй записати ще раз.');
  }
  if (size > GROQ_AUDIO_MAX_BYTES) {
    throw new Error('Запис завеликий для розпізнавання (понад 25MB). Спробуй коротший запис.');
  }

  const type = (audio as File).type || 'audio/webm';
  const name = options.filename || (audio as File).name || 'braindump.webm';
  const upload = audio instanceof File ? audio : new File([audio], name, { type });

  const formData = buildGroqFormData(options.language);
  formData.append('file', upload);

  const sttRes = await groqTranscribe(apiKey, formData);
  if (!sttRes.ok) {
    const body = await sttRes.text();
    throw new Error(`Помилка транскрипції (${sttRes.status}): ${body.slice(0, 500)}`);
  }

  const parsed = (await sttRes.json()) as GroqTranscriptionResponse;
  return {
    language: parsed.language ?? null,
    transcript: (parsed.text ?? '').trim(),
    segments: normalizeSegments(parsed.segments),
  };
}

/**
 * Transcribes audio from a remote media file. Intentionally does **not** pass `url` to Groq:
 * Groq’s hosted fetch often fails on Instagram/TikTok CDNs and may return errors like
 * "Failed to parse URL from /pipeline" even when the URL is valid for server-side fetch.
 */
export async function transcribeMediaFromUrl(mediaUrl: string): Promise<TranscriptResult> {
  const apiKey = requireServerEnv('GROQ_API_KEY');

  if (!isAbsoluteHttpUrlString(mediaUrl)) {
    throw new Error(
      'Отримано некоректне посилання на відео (потрібен повний https://…). Спробуй інше посилання або пізніше.'
    );
  }

  let mediaRes: Response;
  try {
    mediaRes = await fetch(mediaUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: '*/*',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Не вдалося завантажити відео: ${msg}. Якщо рілс публічний — спробуй ще раз через хвилину.`
    );
  }

  if (!mediaRes.ok) {
    throw new Error(
      `Не вдалося завантажити відео (HTTP ${mediaRes.status}). Можливо, Reel приватний або тимчасово недоступний.`
    );
  }

  const contentType = mediaRes.headers.get('content-type') || 'video/mp4';
  const mediaBuffer = await mediaRes.arrayBuffer();
  if (mediaBuffer.byteLength > GROQ_MAX_UPLOAD_BYTES) {
    throw new Error(
      'Відео завелике для розпізнавання (понад 25MB). Спробуй коротший рілс або інший ролик.'
    );
  }

  const rawBuf = Buffer.from(mediaBuffer);
  const inputExt = guessInputExt(contentType, mediaUrl);
  const filename = `reel.${inputExt}`;
  const upload = new File([new Uint8Array(rawBuf)], filename, { type: contentType });
  const formFile = buildGroqFormData();
  formFile.append('file', upload);

  const sttRes = await groqTranscribe(apiKey, formFile);

  if (!sttRes.ok) {
    const body = await sttRes.text();
    throw new Error(
      `Помилка транскрипції (${sttRes.status}): ${body.slice(0, 500)}`
    );
  }

  return parseTranscriptionResponse(sttRes);
}
