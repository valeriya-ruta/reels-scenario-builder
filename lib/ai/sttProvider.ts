import 'server-only';

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

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

export async function transcribeMediaFromUrl(mediaUrl: string): Promise<TranscriptResult> {
  const apiKey = requireServerEnv('GROQ_API_KEY');

  const formUrl = buildGroqFormData();
  formUrl.append('url', mediaUrl);

  let sttRes = await groqTranscribe(apiKey, formUrl);

  if (!sttRes.ok) {
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) {
      throw new Error(`Unable to download media for transcription (${mediaRes.status})`);
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
      const firstErr = await sttRes.text();
      throw new Error(
        `Transcription failed (Groq: ${firstErr.slice(0, 280)}). Audio extract: ${msg}`
      );
    }

    const upload = new File([new Uint8Array(audioBuf)], 'reel-audio.flac', { type: 'audio/flac' });
    const formFile = buildGroqFormData();
    formFile.append('file', upload);

    sttRes = await groqTranscribe(apiKey, formFile);
  }

  if (!sttRes.ok) {
    const body = await sttRes.text();
    throw new Error(`STT request failed (${sttRes.status}): ${body}`);
  }

  return parseTranscriptionResponse(sttRes);
}
