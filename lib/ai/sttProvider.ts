import 'server-only';

import {
  OPENROUTER_STT_MODEL,
  OPENROUTER_TRANSCRIPTIONS_URL,
  openRouterUploadHeaders,
  requireOpenRouterKey,
} from '@/lib/ai/openrouter';
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

/** OpenRouter enforces the same 25MB cap on multipart uploads that OpenAI does. */
const STT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

interface SttSegment {
  start?: number;
  end?: number;
  text?: string;
}

interface SttTranscriptionResponse {
  language?: string;
  text?: string;
  segments?: SttSegment[];
}

function normalizeSegments(segments: SttSegment[] | undefined): TranscriptSegment[] {
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

type SttResponseFormat = 'verbose_json' | 'json';

function buildTranscriptionFormData(
  file: File,
  responseFormat: SttResponseFormat,
  language?: string
): FormData {
  const formData = new FormData();
  formData.append('model', OPENROUTER_STT_MODEL);
  formData.append('response_format', responseFormat);
  formData.append('temperature', '0');
  if (language) {
    formData.append('language', language);
  }
  formData.append('file', file);
  return formData;
}

/**
 * Uploads audio to OpenRouter's OpenAI-compatible transcription endpoint.
 *
 * `verbose_json` is what carries the per-segment timestamps the scene splitter
 * runs on, but only OpenAI-compatible upstreams honour it — the rest answer 400.
 * The configured model routes to one of those today; if that ever changes, a
 * single retry as plain `json` keeps transcription working and merely drops the
 * timestamps, which every caller already tolerates.
 */
export async function postTranscription(
  apiKey: string,
  file: File,
  options: { language?: string } = {}
): Promise<Response> {
  const send = (responseFormat: SttResponseFormat) =>
    fetch(OPENROUTER_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: openRouterUploadHeaders(apiKey),
      body: buildTranscriptionFormData(file, responseFormat, options.language),
    });

  const verbose = await send('verbose_json');
  if (verbose.status !== 400) {
    return verbose;
  }

  // Release the rejected response before re-uploading.
  await verbose.text().catch(() => undefined);
  return send('json');
}

async function parseTranscriptionResponse(sttRes: Response): Promise<TranscriptResult> {
  const parsed = (await sttRes.json()) as SttTranscriptionResponse;
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

/**
 * Transcribes raw audio bytes uploaded directly from the browser (MediaRecorder
 * capture), reusing the exact same Whisper path as reel transcription — same
 * key, same direct-bytes FormData upload, same model. No ffmpeg, no remote
 * fetch. Used by the braindump voice capture.
 */
export async function transcribeAudioFile(
  audio: File | Blob,
  options: { language?: string; filename?: string } = {}
): Promise<TranscriptResult> {
  const apiKey = requireOpenRouterKey();

  const size = audio.size ?? 0;
  if (size === 0) {
    throw new Error('Порожній аудіозапис. Спробуй записати ще раз.');
  }
  if (size > STT_MAX_UPLOAD_BYTES) {
    throw new Error('Запис завеликий для розпізнавання (понад 25MB). Спробуй коротший запис.');
  }

  const type = (audio as File).type || 'audio/webm';
  const name = options.filename || (audio as File).name || 'braindump.webm';
  const upload = audio instanceof File ? audio : new File([audio], name, { type });

  const sttRes = await postTranscription(apiKey, upload, { language: options.language });
  if (!sttRes.ok) {
    const body = await sttRes.text();
    throw new Error(`Помилка транскрипції (${sttRes.status}): ${body.slice(0, 500)}`);
  }

  const parsed = (await sttRes.json()) as SttTranscriptionResponse;
  return {
    language: parsed.language ?? null,
    transcript: (parsed.text ?? '').trim(),
    segments: normalizeSegments(parsed.segments),
  };
}

/**
 * Transcribes audio from a remote media file. Intentionally downloads the media
 * here and uploads the bytes rather than handing the provider a URL: hosted
 * fetches routinely fail on Instagram/TikTok CDNs even when the URL is perfectly
 * valid for a server-side fetch.
 */
export async function transcribeMediaFromUrl(mediaUrl: string): Promise<TranscriptResult> {
  const apiKey = requireOpenRouterKey();

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
  if (mediaBuffer.byteLength > STT_MAX_UPLOAD_BYTES) {
    throw new Error(
      'Відео завелике для розпізнавання (понад 25MB). Спробуй коротший рілс або інший ролик.'
    );
  }

  const rawBuf = Buffer.from(mediaBuffer);
  const inputExt = guessInputExt(contentType, mediaUrl);
  const filename = `reel.${inputExt}`;
  const upload = new File([new Uint8Array(rawBuf)], filename, { type: contentType });

  const sttRes = await postTranscription(apiKey, upload);

  if (!sttRes.ok) {
    const body = await sttRes.text();
    throw new Error(
      `Помилка транскрипції (${sttRes.status}): ${body.slice(0, 500)}`
    );
  }

  return parseTranscriptionResponse(sttRes);
}
