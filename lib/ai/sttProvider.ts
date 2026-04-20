import 'server-only';

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

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

/** Mono 16 kHz FLAC — small enough for Groq’s ~25MB upload cap even for long reels. */
async function transcodeToSpeechFlac(inputBuffer: Buffer, inputExt: string): Promise<Buffer> {
  const ffmpeg = ffmpegStatic;
  if (!ffmpeg) {
    throw new Error('ffmpeg binary is not available on this platform.');
  }

  const id = randomBytes(12).toString('hex');
  const inputPath = join(tmpdir(), `stt-in-${id}.${inputExt}`);
  const outputPath = join(tmpdir(), `stt-out-${id}.flac`);

  await writeFile(inputPath, inputBuffer);

  const args = [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-map',
    '0:a:0',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'flac',
    '-compression_level',
    '8',
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr?.on('data', (d: Buffer) => {
      err += d.toString();
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${err.slice(-1800)}`));
    });
  });

  try {
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

function buildGroqFormData(): FormData {
  const formData = new FormData();
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');
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

  const contentType = mediaRes.headers.get('content-type') || 'audio/mp4';
  const mediaBuffer = await mediaRes.arrayBuffer();
  const rawBuf = Buffer.from(mediaBuffer);
  const inputExt = guessInputExt(contentType, mediaUrl);

  let audioBuf: Buffer;
  try {
    audioBuf = await transcodeToSpeechFlac(rawBuf, inputExt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Не вдалося витягнути аудіо з відео. Спробуй інший рілс або пізніше. (${msg.slice(0, 320)})`
    );
  }

  const upload = new File([new Uint8Array(audioBuf)], 'reel-audio.flac', { type: 'audio/flac' });
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
